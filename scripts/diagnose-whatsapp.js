import makeWASocket, { initAuthCreds, DEFAULT_CONNECTION_CONFIG } from '@whiskeysockets/baileys';
import pino from 'pino';
import { resolveVersion } from '../wa-version.js';

// Autenticação temporária apenas em memória; não lê nem altera a sessão do app.
const info = await resolveVersion({ fallback: DEFAULT_CONNECTION_CONFIG.version });
console.log(`Protocolo: ${info.version.join('.')} (${info.source})`);
if (info.warning) console.log(`Aviso: ${info.warning}`);
const sock = makeWASocket({
  version: info.version,
  auth: { creds: initAuthCreds(), keys: { get: async () => ({}), set: async () => {} } },
  logger: pino({ level: 'silent' }),
  connectTimeoutMs: 20000,
});
let done = false;
const timer = setTimeout(() => finish(1, 'Tempo esgotado sem QR Code.'), 30000);
function finish(code, message) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  console.log(message);
  sock.end(undefined);
  setTimeout(() => process.exit(code), 100);
}
sock.ev.on('connection.update', update => {
  if (update.qr) finish(0, 'OK: WhatsApp gerou um QR Code. Nenhuma sessão foi salva.');
  if (update.connection === 'close' && !done) {
    const error = update.lastDisconnect?.error;
    finish(1, `Falha: código ${error?.output?.statusCode}, ${error?.message}, motivo ${error?.data?.attrs?.reason || 'não informado'}`);
  }
});
