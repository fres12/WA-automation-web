// ── wa-status.js ──────────────────────────────────────────────────────────────
// Tanggung jawab file ini:
//   1. Membaca status & QR code dari tabel wa_accounts di Supabase (realtime).
//   2. Menampilkan QR code yang sudah ditulis server lokal ke kolom qr_code_base64.
//   3. Membaca daftar grup dari database saat tombol Refresh ditekan.
//
// Yang TIDAK ada di sini:
//   - Logika koneksi Baileys (itu di server lokal)
//   - EventSource / SSE ke backend lokal
//   - Endpoint /api/wa/connect, /api/wa/reset, /api/wa/qr
// ─────────────────────────────────────────────────────────────────────────────

const statusBadge = document.getElementById('statusBadge');
const statusMessage = document.getElementById('statusMessage');
const reconnectBtn = document.getElementById('reconnectBtn');
const qrState = document.getElementById('qrState');
const qrImage = document.getElementById('qrImage');
const refreshQrBtn = document.getElementById('refreshQrBtn');
const phoneEl = document.getElementById('phone');
const refreshBtn = document.getElementById('refreshBtn');
const groupsState = document.getElementById('groupsState');
const tableWrap = document.getElementById('tableWrap');
const groupsBody = document.getElementById('groupsBody');
const WA_BRIDGE_URL = window.WA_BRIDGE_URL || 'ws://127.0.0.1:3001';

// Label & pesan sesuai constraint wa_accounts_status_check
const STATUS_LABEL = {
  connected: 'Terhubung',
  qr: 'Scan QR',
  connecting: 'Menghubungkan…',
  logged_out: 'Logout',
  disconnected: 'Terputus',
};

const STATUS_MESSAGE = {
  connected: 'WhatsApp berhasil terhubung.',
  qr: 'Scan QR code dengan WhatsApp di ponsel Anda.',
  connecting: 'Sedang menghubungkan, harap tunggu…',
  logged_out: 'Sesi berakhir. Server lokal perlu memulai ulang koneksi.',
  disconnected: 'WhatsApp belum terhubung. Jalankan server lokal untuk memulai.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Render UI berdasarkan baris wa_accounts dari Supabase
// ─────────────────────────────────────────────────────────────────────────────
function renderAccount(account, { autoLoadGroups = false } = {}) {
  const status = account?.status ?? 'disconnected';

  statusBadge.textContent = STATUS_LABEL[status] ?? status;
  statusBadge.dataset.status = status;
  statusMessage.textContent = STATUS_MESSAGE[status] ?? '';

  // QR code — wadah hanya tampil saat status='qr', disembunyikan saat connected
  const isQrStatus = status === 'qr';
  qrState.hidden = !isQrStatus;

  if (isQrStatus && account?.qr_code_base64) {
    displayQrCode(account.qr_code_base64);
  } else {
    qrImage.src = '';
    qrImage.style.display = 'none';
  }

  // Nomor telepon — tampil hanya saat connected
  if (status === 'connected') {
    const rawPhone = account?.phone ? String(account.phone).split('@')[0].split(':')[0].replace(/\D/g, '') : '';
    phoneEl.hidden = false;
    phoneEl.textContent = rawPhone ? `Terhubung: +${rawPhone}` : 'Perangkat terhubung';
  } else {
    phoneEl.hidden = true;
    phoneEl.textContent = '';
  }

  // Tombol Refresh juga dipakai untuk meminta reconnect saat koneksi putus.
  refreshBtn.disabled = !activeAccount;
  reconnectBtn.disabled = !activeAccount;

  // Auto-load grup dari database saat pertama connected atau status baru berubah ke connected
  const justConnected = status === 'connected' && prevStatus !== 'connected';
  if (autoLoadGroups || justConnected) {
    loadGroups();
  }

  prevStatus = status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ambil akun WA milik user yang sedang login via backend
// ─────────────────────────────────────────────────────────────────────────────
let activeAccount = null;
let realtimeChannel = null;
let prevStatus = null;

async function loadAccount() {
  try {
    const res = await fetch('/api/wa/accounts');
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Gagal membaca akun WhatsApp.');

    if (!data.accounts?.length) {
      activeAccount = null;
      renderAccount(null);
      statusMessage.textContent = 'Belum ada akun WhatsApp yang terasosiasi. Hubungi administrator.';
      refreshBtn.disabled = true;
      return;
    }

    activeAccount = data.accounts[0];
    // autoLoadGroups=true: langsung load grup jika sudah connected saat page pertama dibuka
    renderAccount(activeAccount, { autoLoadGroups: activeAccount.status === 'connected' });
    subscribeRealtime(activeAccount.id);
  } catch (err) {
    statusMessage.textContent = err.message;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Realtime — pantau perubahan di wa_accounts
// Backend menyediakan /api/wa/realtime-config → { supabaseUrl, anonKey }
// ─────────────────────────────────────────────────────────────────────────────
async function subscribeRealtime(accountId) {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe?.();
    realtimeChannel = null;
  }

  let supabaseUrl, anonKey;
  try {
    const res = await fetch('/api/wa/realtime-config');
    const data = await res.json();
    if (!res.ok || !data.supabaseUrl) throw new Error('Konfigurasi realtime tidak tersedia.');
    supabaseUrl = data.supabaseUrl;
    anonKey = data.anonKey;
  } catch {
    startPolling(accountId);
    return;
  }

  try {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      startPolling(accountId);
      return;
    }

    const client = supabase.createClient(supabaseUrl, anonKey);
    realtimeChannel = client
      .channel(`wa_account_${accountId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wa_accounts', filter: `id=eq.${accountId}` },
        (payload) => {
          if (payload.new) {
            activeAccount = { ...activeAccount, ...payload.new };
            // renderAccount akan auto-load grup jika status baru berubah ke 'connected'
            renderAccount(activeAccount);
          }
        }
      )
      .subscribe();
  } catch {
    startPolling(accountId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: polling ke /api/wa/accounts tiap 10 detik
// ─────────────────────────────────────────────────────────────────────────────
let pollingTimer = null;

function startPolling(accountId) {
  stopPolling();
  // Polling lebih cepat (5 detik) saat menunggu QR, normal 10 detik
  const interval = activeAccount?.status === 'qr' ? 5_000 : 10_000;
  pollingTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/wa/accounts');
      const data = await res.json();
      if (res.ok && data.success && data.accounts?.length) {
        const updated = data.accounts.find((a) => a.id === accountId);
        if (updated) {
          const statusChanged = updated.status !== activeAccount?.status;
          activeAccount = updated;
          // renderAccount akan auto-load grup jika status baru berubah ke 'connected'
          renderAccount(activeAccount);
          // Jika status berubah, restart polling dengan interval yang sesuai
          if (statusChanged) { startPolling(accountId); }
        }
      }
    } catch { /* abaikan error polling */ }
  }, interval);
}

function stopPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh grup — baca dari database saja (server lokal yang isi tabel wa_groups)
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderGroupRows(groups) {
  groupsBody.replaceChildren();
  groups.forEach((group) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(group.group_name)}</td>
      <td><code>${escapeHtml(group.group_jid)}</code></td>
      <td><button type="button" class="btn-copy">Salin</button></td>
    `;
    const btn = row.querySelector('.btn-copy');
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(group.group_jid);
      btn.textContent = '✓ Tersalin';
      setTimeout(() => { btn.textContent = 'Salin'; }, 2000);
    });
    groupsBody.appendChild(row);
  });

  if (groups.length === 0) {
    groupsState.hidden = false;
    groupsState.textContent = 'Tidak ada grup ditemukan. Pastikan WhatsApp terhubung dan server lokal berjalan.';
    tableWrap.hidden = true;
  } else {
    groupsState.hidden = true;
    tableWrap.hidden = false;
  }
}

async function loadGroups() {
  if (!activeAccount) return;
  groupsState.hidden = false;
  groupsState.textContent = 'Membaca daftar grup dari database…';
  tableWrap.hidden = true;

  try {
    // 1. Coba baca dari cache (wa_groups table)
    const res = await fetch(`/api/wa/groups/cache?account_id=${encodeURIComponent(activeAccount.id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membaca grup.');

    let groups = data.groups ?? [];

    // 2. Cache kosong & WA connected → paksa sync dari WA client ke DB
    if (groups.length === 0 && activeAccount?.status === 'connected') {
      groupsState.textContent = 'Cache kosong, mengambil grup dari WhatsApp…';
      try {
        const syncRes = await fetch(`/api/wa/groups?account_id=${encodeURIComponent(activeAccount.id)}`);
        const syncData = await syncRes.json();
        if (syncRes.ok && syncData.success && Array.isArray(syncData.groups)) {
          // Format WA client: { id, name } → { group_jid, group_name }
          groups = syncData.groups.map((g) => ({ group_jid: g.id, group_name: g.name }));
        } else {
          console.warn('[wa] Sync grup gagal:', syncData?.error);
        }
      } catch (syncErr) {
        console.warn('[wa] Force sync error:', syncErr.message);
      }
    }

    renderGroupRows(groups);
  } catch (err) {
    groupsState.hidden = false;
    groupsState.textContent = err.message || 'Gagal membaca grup.';
    tableWrap.hidden = true;
  }
}

function requestBridgeReconnect() {
  return new Promise((resolve, reject) => {
    const websocket = new WebSocket(WA_BRIDGE_URL);
    const timeout = setTimeout(() => {
      websocket.close();
      reject(new Error('Bridge WhatsApp tidak merespons.'));
    }, 10_000);

    websocket.addEventListener('message', (event) => {
      let response;
      try { response = JSON.parse(event.data); } catch { return; }
      if (!Object.prototype.hasOwnProperty.call(response, 'ok')) return;
      clearTimeout(timeout);
      websocket.close();
      if (response.ok) resolve(response);
      else reject(new Error(response.error || 'Reconnect WhatsApp gagal.'));
    });
    websocket.addEventListener('open', () => {
      websocket.send(JSON.stringify({ action: 'reconnect' }));
    });
    websocket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Bridge WhatsApp tidak dapat dihubungi.'));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Code Generator & Decoder Helper
// ─────────────────────────────────────────────────────────────────────────────
function decodeQrString(str) {
  if (!str) return '';
  const trimmed = str.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;

  try {
    const decoded = atob(trimmed);
    if (decoded && (decoded.includes('@') || decoded.includes('wa.me') || decoded.includes(',') || decoded.length > 20)) {
      return decoded;
    }
  } catch (e) {
    // Bukan base64 biasa, gunakan raw
  }
  return trimmed;
}

function displayQrCode(rawCode) {
  if (!rawCode) {
    qrImage.src = '';
    qrImage.style.display = 'none';
    return;
  }

  // Jika berupa image data url langsung
  if (rawCode.startsWith('data:image/')) {
    qrImage.src = rawCode;
    qrImage.style.display = 'inline-block';
    return;
  }

  const textToEncode = decodeQrString(rawCode);

  // 1. Coba QRCode.js jika tersedia
  if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
    QRCode.toDataURL(textToEncode, { width: 256, margin: 2, color: { dark: '#000000', light: '#ffffff' } }, (err, url) => {
      if (!err && url) {
        qrImage.src = url;
        qrImage.style.display = 'inline-block';
      } else {
        fallbackQr(textToEncode);
      }
    });
  } else {
    fallbackQr(textToEncode);
  }
}

function fallbackQr(text) {
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&margin=6&data=${encodeURIComponent(text)}`;
  qrImage.style.display = 'inline-block';
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh QR — baca ulang qr_code_base64 terbaru dari database
// Berguna saat QR sudah expired dan server lokal sudah generate QR baru.
// ─────────────────────────────────────────────────────────────────────────────
async function refreshQr() {
  if (!activeAccount) return;
  refreshQrBtn.disabled = true;
  refreshQrBtn.textContent = '⏳';
  try {
    const res = await fetch('/api/wa/accounts');
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Gagal memuat.');
    const updated = data.accounts?.find((a) => a.id === activeAccount.id);
    if (updated) {
      activeAccount = updated;
      renderAccount(activeAccount);
    }
  } catch (err) {
    statusMessage.textContent = err.message;
  } finally {
    refreshQrBtn.disabled = false;
    refreshQrBtn.textContent = '↻';
  }
}

async function reconnectWhatsApp() {
  if (!activeAccount) return;
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = '...';
  try {
    await requestBridgeReconnect();
    await loadAccount();
  } catch (err) {
    statusMessage.textContent = err.message;
  } finally {
    reconnectBtn.textContent = '\u21BB';
    reconnectBtn.disabled = !activeAccount;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event listeners & init
// ─────────────────────────────────────────────────────────────────────────────
refreshQrBtn.addEventListener('click', refreshQr);
reconnectBtn.addEventListener('click', reconnectWhatsApp);
refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Menghubungkan…';
  try {
    await requestBridgeReconnect();
    await loadAccount();
    if (activeAccount?.status === 'connected') await loadGroups();
  } catch (err) {
    groupsState.hidden = false;
    groupsState.textContent = err.message;
    tableWrap.hidden = true;
  } finally {
    refreshBtn.textContent = 'Refresh';
    refreshBtn.disabled = !activeAccount;
  }
});
loadAccount();

