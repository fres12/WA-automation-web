const fs = require('fs/promises');
const path = require('path');

const authRoot = path.join(__dirname, 'data', 'baileys-auth');
const accounts = new Map();

function getAccount(accountId) {
  if (!accounts.has(accountId)) {
    accounts.set(accountId, {
      socket: null,
      connecting: null,
      reconnectTimer: null,
      manualClose: false,
      sessionName: null,
      listeners: new Set(),
      state: { accountId, status: 'disconnected', message: 'WhatsApp belum terhubung.', qr: null, phone: null }
    });
  }
  return accounts.get(accountId);
}

function publish(accountId, update) {
  const account = getAccount(accountId);
  account.state = { ...account.state, ...update };
  account.listeners.forEach((listener) => listener(account.state));
}

function subscribe(accountId, listener, options = {}) {
  const account = getAccount(accountId);
  account.listeners.add(listener);
  if (options.initial !== false) listener(account.state);
  return () => account.listeners.delete(listener);
}

async function connectWhatsApp(accountId, sessionName) {
  const account = getAccount(accountId);
  if (account.socket) return account.state;
  if (account.connecting) return account.connecting;
  account.sessionName = sessionName;
  account.connecting = (async () => {
    try {
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
      const authFolder = path.join(authRoot, sessionName);
      const auth = await useMultiFileAuthState(authFolder);
      publish(accountId, { status: 'connecting', message: 'Menyiapkan koneksi WhatsApp...', qr: null });
      const socket = makeWASocket({
        auth: auth.state,
        printQRInTerminal: false,
        browser: ['WA Automation', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000
      });
      account.socket = socket;
      socket.ev.on('creds.update', auth.saveCreds);
      socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) publish(accountId, { status: 'qr', message: 'Scan QR dari WhatsApp > Perangkat tertaut.', qr });
        if (connection === 'open') {
          const phone = socket.user?.id?.split(':')[0] || null;
          publish(accountId, { status: 'connected', message: 'WhatsApp terhubung.', qr: null, phone });
        }
        if (connection === 'close') {
          if (account.socket === socket) account.socket = null;
          const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
          const manualClose = account.manualClose;
          account.manualClose = false;
          publish(accountId, {
            status: loggedOut ? 'logged_out' : 'disconnected',
            message: loggedOut ? 'Sesi logout. Tekan Scan ulang untuk menghapus sesi lama.' : 'Koneksi terputus. Mencoba menyambungkan kembali...',
            qr: null,
            phone: null
          });
          if (!loggedOut && !manualClose && !account.reconnectTimer) {
            account.reconnectTimer = setTimeout(() => {
              account.reconnectTimer = null;
              connectWhatsApp(accountId, sessionName).catch((error) => {
                publish(accountId, { status: 'disconnected', message: `Gagal menyambungkan kembali: ${error.message}` });
              });
            }, 2_000);
          }
        }
      });
      return account.state;
    } catch (error) {
      account.socket = null;
      publish(accountId, { status: 'disconnected', message: `Gagal memulai WhatsApp: ${error.message}`, qr: null });
      throw error;
    } finally {
      account.connecting = null;
    }
  })();
  return account.connecting;
}

async function resetSession(accountId, sessionName) {
  const account = getAccount(accountId);
  if (account.socket) {
    account.manualClose = true;
    try { account.socket.end(undefined); } catch {}
    account.socket = null;
  }
  if (account.reconnectTimer) {
    clearTimeout(account.reconnectTimer);
    account.reconnectTimer = null;
  }
  await fs.rm(path.join(authRoot, sessionName), { recursive: true, force: true });
  publish(accountId, { status: 'disconnected', message: 'Sesi lama dihapus. Siap scan QR baru.', qr: null, phone: null });
  return connectWhatsApp(accountId, sessionName);
}

async function getGroups(accountId) {
  const account = getAccount(accountId);
  if (!account.socket || account.state.status !== 'connected') throw new Error('WhatsApp belum terhubung');
  const groups = await account.socket.groupFetchAllParticipating();
  return Object.values(groups).map((group) => ({ id: group.id, name: group.subject || '(Tanpa nama)', participants: group.participants?.length || 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { connectWhatsApp, resetSession, getGroups, subscribe };
