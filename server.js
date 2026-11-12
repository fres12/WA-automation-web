require('dotenv').config();
const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const waClient = require('./wa-client');
const { createAuthMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY belum diset di .env');
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  requireApiAuth,
  requireAdminApi
} = createAuthMiddleware({
  supabaseUrl: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email dan password wajib diisi.' });
  }

  try {
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email: email.trim(), password })
    });
    const authData = await authResponse.json();

    if (!authResponse.ok || !authData.access_token || !authData.user?.id) {
      return res.status(401).json({ success: false, error: 'Email atau password salah.' });
    }

    const profileKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,email,username,role&id=eq.${encodeURIComponent(authData.user.id)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: profileKey,
          Authorization: `Bearer ${profileKey}`
        }
      }
    );
    const profiles = await profileResponse.json();
    if (!profileResponse.ok || !profiles[0]) {
      return res.status(403).json({ success: false, error: 'Profile akun belum tersedia.' });
    }

    res.setHeader('Set-Cookie', `wa_access_token=${encodeURIComponent(authData.access_token)}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({
      success: true,
      profile: profiles[0]
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(502).json({ success: false, error: 'Login gagal terhubung ke server autentikasi.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'wa_access_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ success: true });
});

app.use('/api', requireApiAuth);

app.get('/api/auth/me', (req, res) => {
  res.json({ success: true, user: req.auth.user, profile: req.auth.profile });
});

async function getWaAccount(accountId) {
  const response = await supabaseRequest(
    `wa_accounts?select=id,phone,status,session_name,user_id,created_at,updated_at,qr_code_base64&id=eq.${encodeURIComponent(accountId)}`,
    { apiKey: SUPABASE_SERVICE_ROLE_KEY }
  );
  const [account] = await response.json();
  return account || null;
}

function canAccessWaAccount(req, account) {
  return Boolean(account && (req.auth.profile.role === 'admin' || account.user_id === req.auth.user.id));
}

async function updateWaAccount(accountId, update) {
  await supabaseRequest(`wa_accounts?id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    apiKey: SUPABASE_SERVICE_ROLE_KEY,
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...update, updated_at: new Date().toISOString() })
  });
}

const waSubscriptions = new Set();
const waGroupSyncs = new Set();
function watchWaAccount(accountId) {
  if (waSubscriptions.has(accountId)) return;
  waSubscriptions.add(accountId);
  waClient.subscribe(accountId, (state) => {
    updateWaAccount(accountId, {
      status: state.status,
      phone: state.phone,
      qr_code_base64: state.qr ? Buffer.from(state.qr).toString('base64') : null
    }).catch((error) => console.error('[wa] Account state sync error:', error.message));

    if (state.status === 'connected' && !waGroupSyncs.has(accountId)) {
      waGroupSyncs.add(accountId);
      waClient.getGroups(accountId)
        .then((groups) => syncWaGroupsCache(accountId, groups))
        .catch((error) => console.error('[wa] Automatic group cache sync error:', error.message))
        .finally(() => waGroupSyncs.delete(accountId));
    }

    if (['disconnected', 'logged_out'].includes(state.status)) {
      clearWaGroupsCache(accountId).catch((error) => console.error('[wa] Group cache clear error:', error.message));
    }
  }, { initial: false });
}

app.get('/api/wa/accounts', async (req, res) => {
  try {
    const response = await supabaseRequest(
      `wa_accounts?select=id,phone,status,user_id,session_name,created_at,updated_at,qr_code_base64&user_id=eq.${encodeURIComponent(req.auth.user.id)}&order=created_at.desc`,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    const accounts = await response.json();
    res.json({ success: true, accounts });
  } catch (error) {
    console.error('[wa] Account list error:', error.message);
    res.status(502).json({ success: false, error: 'Gagal membaca daftar akun WhatsApp.' });
  }
});

app.get('/api/wa/realtime-config', (req, res) => {
  res.json({
    success: true,
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
  });
});

app.post('/api/wa/accounts', async (req, res) => {
  try {
    const existingResponse = await supabaseRequest(
      `wa_accounts?select=id&user_id=eq.${encodeURIComponent(req.auth.user.id)}`,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    const existingAccounts = await existingResponse.json();
    if (existingAccounts.length > 0) {
      return res.status(409).json({ success: false, error: 'Akun Anda sudah terdaftar. Satu user hanya dapat memiliki satu akun WhatsApp.' });
    }
    const account = {
      user_id: req.auth.user.id,
      session_name: `wa_${req.auth.user.id}_${randomUUID()}`,
      status: 'disconnected'
    };
    const response = await supabaseRequest('wa_accounts', {
      method: 'POST',
      apiKey: SUPABASE_SERVICE_ROLE_KEY,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(account)
    });
    const [created] = await response.json();
    res.status(201).json({ success: true, account: created });
  } catch (error) {
    console.error('[wa] Account create error:', error.message);
    res.status(502).json({ success: false, error: 'Gagal membuat akun WhatsApp.' });
  }
});

app.post('/api/wa/connect-self', async (req, res) => {
  try {
    const existingResponse = await supabaseRequest(
      `wa_accounts?select=id,phone,status,session_name,user_id&user_id=eq.${encodeURIComponent(req.auth.user.id)}`,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    const existingAccounts = await existingResponse.json();
    let account = existingAccounts[0];

    if (!account) {
      return res.status(409).json({ success: false, needsScan: true, error: 'Hubungkan WhatsApp dari halaman WA Status terlebih dahulu.' });
    }

    if (['disconnected', 'logged_out'].includes(account.status)) {
      await clearWaGroupsCache(account.id);
      return res.status(409).json({ success: false, needsScan: true, error: 'Sesi WhatsApp terputus. Scan ulang dari halaman WA Status.' });
    }

    watchWaAccount(account.id);
    const state = await waClient.connectWhatsApp(account.id, account.session_name);
    res.json({ success: true, account, state });
  } catch (error) {
    console.error('[wa] Self connect error:', error.message);
    res.status(502).json({ success: false, error: 'Gagal memulai koneksi WhatsApp.' });
  }
});

app.get('/api/wa/events', async (req, res) => {
  const account = await getWaAccount(req.query.account_id);
  if (!canAccessWaAccount(req, account)) return res.status(403).json({ success: false, error: 'Akses akun WhatsApp ditolak.' });
  watchWaAccount(account.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (state) => res.write(`data: ${JSON.stringify(state)}\n\n`);
  const unsubscribe = waClient.subscribe(account.id, send);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

app.post('/api/wa/connect', async (req, res) => {
  try {
    const account = await getWaAccount(req.body?.account_id);
    if (!canAccessWaAccount(req, account)) return res.status(403).json({ success: false, error: 'Akses akun WhatsApp ditolak.' });
    watchWaAccount(account.id);
    res.json(await waClient.connectWhatsApp(account.id, account.session_name));
  }
  catch (error) { console.error('[wa] connect:', error); res.status(500).json({ success: false, error: 'Gagal memulai koneksi WhatsApp.' }); }
});

app.post('/api/wa/reset', async (req, res) => {
  try {
    const account = await getWaAccount(req.body?.account_id);
    if (!canAccessWaAccount(req, account)) return res.status(403).json({ success: false, error: 'Akses akun WhatsApp ditolak.' });
    watchWaAccount(account.id);
    res.json(await waClient.resetSession(account.id, account.session_name));
  }
  catch (error) { console.error('[wa] reset:', error); res.status(500).json({ success: false, error: 'Gagal mereset sesi WhatsApp.' }); }
});

app.get('/api/wa/qr', async (req, res) => {
  const account = await getWaAccount(req.query.account_id);
  if (!canAccessWaAccount(req, account)) return res.status(403).send('Akses akun WhatsApp ditolak');
  const value = typeof req.query.value === 'string' ? req.query.value : '';
  if (!value) return res.status(400).send('QR value wajib diisi');
  try {
    const dataUrl = await QRCode.toDataURL(value, { width: 500, margin: 1 });
    res.type('png').send(Buffer.from(dataUrl.split(',')[1], 'base64'));
  } catch { res.status(500).send('Gagal membuat QR'); }
});

app.get('/api/wa/groups', async (req, res) => {
  try {
    const account = await getWaAccount(req.query.account_id);
    if (!canAccessWaAccount(req, account)) return res.status(403).json({ success: false, error: 'Akses akun WhatsApp ditolak.' });

    // Pastikan sesi aktif: mulai watch + connect jika socket belum ada
    watchWaAccount(account.id);
    await waClient.connectWhatsApp(account.id, account.session_name);

    const groups = await waClient.getGroups(account.id);
    let cacheSynced = true;

    try {
      await syncWaGroupsCache(account.id, groups);
    } catch (cacheError) {
      cacheSynced = false;
      console.error('[wa] Cache sync error:', cacheError.message);
    }

    res.json({ success: true, groups, cacheSynced });
  }
  catch (error) { res.status(409).json({ success: false, error: error.message }); }
});


app.get('/api/wa/groups/cache', async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diset di .env');
    }
    const accountsResponse = await supabaseRequest(
      `wa_accounts?select=id,status&user_id=eq.${encodeURIComponent(req.auth.user.id)}`,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    const userAccounts = await accountsResponse.json();
    const accountIds = userAccounts.map((account) => account.id);
    if (accountIds.length === 0) return res.json({ success: true, groups: [] });

    let query = `wa_groups?select=group_jid,group_name,is_active,wa_account_id,last_refresh&is_active=eq.true&wa_account_id=in.(${accountIds.map(encodeURIComponent).join(',')})&order=group_name.asc`;
    
    if (req.query.account_id) {
       if (!accountIds.includes(req.query.account_id)) {
           return res.status(403).json({ success: false, error: 'Akses akun WhatsApp ditolak.' });
       }
       query = `wa_groups?select=group_jid,group_name,is_active,wa_account_id,last_refresh&is_active=eq.true&wa_account_id=eq.${encodeURIComponent(req.query.account_id)}&order=group_name.asc`;
    }

    const response = await supabaseRequest(
      query,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    res.json({ success: true, groups: await response.json() });
  } catch (error) {
    console.error('[wa] Cache read error:', error.message);
    res.status(502).json({ success: false, error: 'Gagal membaca cache grup dari database.' });
  }
});

async function supabaseRequest(pathname, options = {}) {
  const apiKey = options.apiKey || SUPABASE_ANON_KEY;
  const requestOptions = { ...options };
  delete requestOptions.apiKey;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function syncWaGroupsCache(accountId, groups) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diset di .env');
  }

  const cacheOptions = { apiKey: SUPABASE_SERVICE_ROLE_KEY };
  const now = new Date().toISOString();
  const rows = groups.map((group) => ({
    group_jid: group.id,
    group_name: group.name,
    wa_account_id: accountId,
    is_active: true,
    last_refresh: now
  }));

  if (rows.length > 0) {
    await supabaseRequest('wa_groups?on_conflict=wa_account_id,group_jid', {
      method: 'POST',
      ...cacheOptions,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
  }

  const existingResponse = await supabaseRequest(
    `wa_groups?select=id,group_jid&wa_account_id=eq.${encodeURIComponent(accountId)}`,
    cacheOptions
  );
  const existingGroups = await existingResponse.json();
  const activeJids = new Set(groups.map((group) => group.id));
  const staleIds = existingGroups
    .filter((group) => !activeJids.has(group.group_jid))
    .map((group) => group.id);

  // Batch deactivate stale groups in satu PATCH instead of per-group
  if (staleIds.length > 0) {
    await supabaseRequest(
      `wa_groups?id=in.(${staleIds.map(encodeURIComponent).join(',')})`,
      {
        method: 'PATCH',
        ...cacheOptions,
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: false, last_refresh: now })
      }
    );
  }
}

async function clearWaGroupsCache(accountId) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  await supabaseRequest(
    `wa_groups?wa_account_id=eq.${encodeURIComponent(accountId)}`,
    {
      method: 'PATCH',
      apiKey: SUPABASE_SERVICE_ROLE_KEY,
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_active: false, last_refresh: new Date().toISOString() })
    }
  );
}

// --- Preview sheets: baca sheet names dari SharePoint link via Excel COM ---

const PREVIEW_TIMEOUT_MS = 60_000; // 60 detik max (Excel startup bisa lambat)
const SCRIPT_PATH = path.join(__dirname, 'scripts', 'read-sheets.ps1');

app.post('/api/preview-sheets', (req, res) => {
  const { link } = req.body;

  if (!link || typeof link !== 'string') {
    return res.status(400).json({ success: false, error: 'Link wajib diisi' });
  }

  // Validasi URL
  let url;
  try {
    url = new URL(link);
    if (url.protocol !== 'https:') throw new Error('Harus HTTPS');
  } catch {
    return res.status(400).json({ success: false, error: 'Link tidak valid (harus https://)' });
  }

  console.log(`[preview] Membaca sheets dari: ${url.hostname}...`);

  const ps = execFile(
    'powershell',
    [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-NonInteractive',
      '-File', SCRIPT_PATH,
      '-Url', link
    ],
    { timeout: PREVIEW_TIMEOUT_MS, windowsHide: true },
    (error, stdout, stderr) => {
      if (error) {
        console.error('[preview] Error:', error.message);
        if (error.killed) {
          return res.status(504).json({
            success: false,
            error: 'Timeout — Excel terlalu lama membuka file. Pastikan kamu sudah login akun kantor di Office.'
          });
        }
        // Coba parse error dari script
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            return res.status(502).json({ success: false, error: parsed.error });
          }
        } catch { }
        return res.status(500).json({
          success: false,
          error: 'Gagal membaca file. Pastikan Excel terinstal dan kamu sudah login akun kantor di Office.'
        });
      }

      // Parse output JSON
      const output = stdout.trim();
      if (!output) {
        return res.status(500).json({ success: false, error: 'Tidak ada output dari Excel' });
      }

      try {
        let sheets = JSON.parse(output);
        // Kalau cuma 1 sheet, PowerShell ConvertTo-Json output string bukan array
        if (typeof sheets === 'string') sheets = [sheets];
        if (!Array.isArray(sheets)) {
          if (sheets.error) {
            return res.status(502).json({ success: false, error: sheets.error });
          }
          throw new Error('Output bukan array');
        }

        console.log(`[preview] Berhasil: ${sheets.length} sheets — ${sheets.join(', ')}`);
        res.json({ success: true, sheets });
      } catch (parseErr) {
        console.error('[preview] Parse error:', parseErr.message, 'Output:', output);
        res.status(500).json({ success: false, error: 'Gagal parse output dari Excel' });
      }
    }
  );
});

// --- Validasi payload sebelum dikirim ke Supabase ---
function normalizeBlastDays(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const days = value.split(',').map((day) => Number(day.trim()));
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) return null;
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
  return uniqueDays.join(',');
}

function validatePayload(body) {
  const { nama_automation, link, jam_blast, tanggal_blast, sheets, group_jids } = body;

  if (!nama_automation || typeof nama_automation !== 'string') {
    return 'Nama automation wajib diisi';
  }
  if (!link || typeof link !== 'string') {
    return 'Link wajib diisi';
  }
  if (!jam_blast || !/^\d{2}:\d{2}(:\d{2})?$/.test(jam_blast)) {
    return 'Jam blast wajib diisi, format HH:MM';
  }
  if (!normalizeBlastDays(tanggal_blast)) {
    return 'Pilih minimal 1 tanggal blast antara 1 sampai 31';
  }
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return 'Minimal 1 sheet harus dipilih';
  }
  if (!Array.isArray(group_jids) || group_jids.length === 0) {
    return 'Minimal 1 grup WhatsApp harus dipilih';
  }
  if (group_jids.some((groupJid) => typeof groupJid !== 'string' || !groupJid.trim())) {
    return 'ID grup WhatsApp tidak valid';
  }
  for (const sheet of sheets) {
    if (!sheet.sheet_name) {
      return 'Setiap sheet wajib punya nama';
    }
    if (!Array.isArray(sheet.ranges) || sheet.ranges.length === 0) {
      return `Sheet "${sheet.sheet_name}" harus punya minimal 1 range`;
    }
    const rangePattern = /^[A-Z]+\d+:[A-Z]+\d+$/i;
    for (const r of sheet.ranges) {
      if (!rangePattern.test(r)) {
        return `Range "${r}" di sheet "${sheet.sheet_name}" formatnya salah (contoh: C1:E9)`;
      }
    }
  }
  return null; // valid
}

app.post('/api/submit', async (req, res) => {
  const error = validatePayload(req.body);
  if (error) {
    return res.status(400).json({ success: false, error });
  }

  const { nama_automation, link, nama_file, jam_blast, tanggal_blast, caption, sheets, group_jids } = req.body;
  const normalizedTanggalBlast = normalizeBlastDays(tanggal_blast);

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, error: 'Cache grup belum dikonfigurasi di server.' });
    }
    const activeGroupsResponse = await supabaseRequest(
      'wa_groups?select=id,group_jid&is_active=eq.true',
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    const activeGroups = await activeGroupsResponse.json();
    const activeGroupMap = new Map(activeGroups.map((group) => [group.group_jid, group.id]));
    const unavailableGroup = group_jids.find((groupJid) => !activeGroupMap.has(groupJid));
    if (unavailableGroup) {
      return res.status(400).json({ success: false, error: 'Ada grup yang sudah tidak aktif. Muat ulang daftar grup lalu pilih lagi.' });
    }

    const serviceOpts = { apiKey: SUPABASE_SERVICE_ROLE_KEY };

    const { id } = req.body;
    let requestId;

    if (id) {
      // 1) Cek existing sheets and delete old relational data
      const existingSheetsResp = await supabaseRequest(`request_sheets?select=id&request_id=eq.${encodeURIComponent(id)}`, serviceOpts);
      const existingSheets = await existingSheetsResp.json();
      const existingSheetIds = existingSheets.map(s => s.id);

      if (existingSheetIds.length > 0) {
        await supabaseRequest(`sheet_tables?sheet_id=in.(${existingSheetIds.map(encodeURIComponent).join(',')})`, {
          method: 'DELETE',
          ...serviceOpts
        });
      }

      await supabaseRequest(`request_sheets?request_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', ...serviceOpts });
      await supabaseRequest(`request_groups?request_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', ...serviceOpts });

      // Update form_request
      await supabaseRequest(`form_request?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        ...serviceOpts,
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          nama_automation,
          link,
          jam_blast,
          tanggal_blast: normalizedTanggalBlast,
          caption: caption || null,
          nama_file: nama_file || null
        })
      });
      requestId = id;
    } else {
      // 1) Insert satu request dan simpan user pembuat dari session login.
      const insertResp = await supabaseRequest('form_request', {
        method: 'POST',
        ...serviceOpts,
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          nama_automation,
          link,
          jam_blast,
          tanggal_blast: normalizedTanggalBlast,
          caption: caption || null,
          nama_file: nama_file || null,
          created_by: req.auth.user.id
        })
      });
      const [inserted] = await insertResp.json();
      requestId = inserted.id;
    }

    // 1.5) Insert groups
    const groupRows = group_jids.map(jid => ({
      request_id: requestId,
      wa_group_id: activeGroupMap.get(jid)
    }));
    await supabaseRequest('request_groups', {
      method: 'POST',
      ...serviceOpts,
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(groupRows)
    });

    // 2) Insert semua sheets sekaligus (batch), lalu ambil ID-nya
    const sheetRows = sheets.map((sheet) => ({
      request_id: requestId,
      sheet_name: sheet.sheet_name
    }));
    const sheetsResp = await supabaseRequest('request_sheets', {
      method: 'POST',
      ...serviceOpts,
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(sheetRows)
    });
    const insertedSheets = await sheetsResp.json();

    // 3) Kumpulkan semua ranges dari semua sheets, lalu batch insert
    const allRangeRows = [];
    for (let i = 0; i < sheets.length; i++) {
      const sheetId = insertedSheets[i].id;
      if (sheets[i].ranges && sheets[i].ranges.length > 0) {
        for (const r of sheets[i].ranges) {
          allRangeRows.push({ sheet_id: sheetId, cell_range: r.toUpperCase() });
        }
      }
    }
    if (allRangeRows.length > 0) {
      await supabaseRequest('sheet_tables', {
        method: 'POST',
        ...serviceOpts,
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(allRangeRows)
      });
    }

    res.json({
      success: true,
      ids: [requestId],
      createdBy: {
        username: req.auth.profile.username,
        email: req.auth.profile.email
      }
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
  }
});

app.get('/api/automations', async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const response = await supabaseRequest(
      `form_request?select=id,nama_automation,nama_file,jam_blast,status,last_run_date,created_at&created_by=eq.${encodeURIComponent(userId)}&order=jam_blast.asc`,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Fetch automations error:', err);
    res.status(500).json({ success: false, error: 'Gagal mengambil data automation' });
  }
});

app.get('/api/automations/:id', async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const automationId = req.params.id;

    // Pastikan automation ini milik user yang sedang login
    const response = await supabaseRequest(
      `form_request?select=id,nama_automation,link,nama_file,jam_blast,tanggal_blast,caption,status,last_run_date,created_at,created_by,request_sheets(id,sheet_name,sheet_tables(cell_range)),request_groups(wa_group_id,wa_groups(group_jid,group_name))&id=eq.${encodeURIComponent(automationId)}&created_by=eq.${encodeURIComponent(userId)}`,
      { apiKey: SUPABASE_SERVICE_ROLE_KEY }
    );

    const data = await response.json();
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Automation tidak ditemukan' });
    }

    res.json({ success: true, data: data[0] });
  } catch (err) {
    console.error('Fetch automation details error:', err);
    res.status(500).json({ success: false, error: 'Gagal mengambil detail automation' });
  }
});

app.patch('/api/automations/:id/status', async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const automationId = req.params.id;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status automation tidak valid' });
    }

    const response = await supabaseRequest(
      `form_request?id=eq.${encodeURIComponent(automationId)}&created_by=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        apiKey: SUPABASE_SERVICE_ROLE_KEY,
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ status })
      }
    );
    const data = await response.json();

    if (!response.ok || !data.length) {
      return res.status(404).json({ success: false, error: 'Automation tidak ditemukan' });
    }

    res.json({ success: true, status: data[0].status });
  } catch (err) {
    console.error('Update automation status error:', err);
    res.status(500).json({ success: false, error: 'Gagal memperbarui status automation' });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const automationId = req.params.id;
    const serviceOpts = { apiKey: SUPABASE_SERVICE_ROLE_KEY };

    const automationResponse = await supabaseRequest(
      `form_request?select=id&id=eq.${encodeURIComponent(automationId)}&created_by=eq.${encodeURIComponent(userId)}`,
      serviceOpts
    );
    const automations = await automationResponse.json();
    if (!automationResponse.ok || !automations.length) {
      return res.status(404).json({ success: false, error: 'Automation tidak ditemukan' });
    }

    const sheetsResponse = await supabaseRequest(
      `request_sheets?select=id&request_id=eq.${encodeURIComponent(automationId)}`,
      serviceOpts
    );
    const sheets = await sheetsResponse.json();
    const sheetIds = sheets.map((sheet) => sheet.id);

    if (sheetIds.length > 0) {
      await supabaseRequest(`sheet_tables?sheet_id=in.(${sheetIds.map(encodeURIComponent).join(',')})`, {
        method: 'DELETE',
        ...serviceOpts
      });
    }

    await supabaseRequest(`request_sheets?request_id=eq.${encodeURIComponent(automationId)}`, {
      method: 'DELETE',
      ...serviceOpts
    });
    await supabaseRequest(`request_groups?request_id=eq.${encodeURIComponent(automationId)}`, {
      method: 'DELETE',
      ...serviceOpts
    });
    const deleteResponse = await supabaseRequest(`form_request?id=eq.${encodeURIComponent(automationId)}&created_by=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      ...serviceOpts
    });

    if (!deleteResponse.ok) {
      throw new Error('Supabase gagal menghapus automation');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete automation error:', err);
    res.status(500).json({ success: false, error: 'Gagal menghapus automation' });
  }
});

async function restoreWaSessions() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  const response = await supabaseRequest(
    'wa_accounts?select=id,session_name,status&status=in.(connected,connecting,qr)',
    { apiKey: SUPABASE_SERVICE_ROLE_KEY }
  );
  const accounts = await response.json();
  await Promise.all(accounts.map(async (account) => {
    try {
      await waClient.connectWhatsApp(account.id, account.session_name);
      watchWaAccount(account.id);
      console.log(`[wa] Session dipulihkan: ${account.id}`);
    } catch (error) {
      console.error(`[wa] Gagal memulihkan session ${account.id}:`, error.message);
    }
  }));
}

restoreWaSessions().catch((error) => console.error('[wa] Restore sessions error:', error.message));

// Serve frontend pages
app.get('/form', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'form.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`WA Blast form server jalan di port ${PORT} (127.0.0.1)`);
});
