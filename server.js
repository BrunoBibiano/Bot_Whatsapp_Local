import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { Server } from 'socket.io';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, DEFAULT_CONNECTION_CONFIG } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { personalize, validateCampaign, parseContacts } from './lib.js';
import { estimateSchedule } from './shared/estimate.js';
import { openDatabase, campaignCsv } from './database.js';
import { resolveVersion } from './wa-version.js';
import { downloadImage, normalizeImageUrl } from './media.js';
import { createPersistentMessageCache } from './message-cache.js';
import { acquireInstanceLock } from './instance-lock.js';

const root = path.dirname(fileURLToPath(import.meta.url));
let instance;
try { instance = await acquireInstanceLock(root); }
catch (error) { console.error(error.message); process.exit(1); }
const authDir = path.join(root, 'auth');
const port = Number(process.env.PORT || 3010);
const origin = `http://localhost:${port}`;
const app = express();
const http = createServer(app);
// Apenas a interface local pode iniciar ações nesta sessão.
const allowed = value => value === origin || value === `http://127.0.0.1:${port}`;
const localHost = host => [`localhost:${port}`, `127.0.0.1:${port}`].includes(host);
const io = new Server(http, {
  // GETs de polling na mesma origem podem vir sem o cabeçalho Origin.
  allowRequest: (req, cb) => cb(null, localHost(req.headers.host)
    && (req.headers.origin === undefined || allowed(req.headers.origin))),
});
app.use((req, res, next) => {
  if (!localHost(req.headers.host)) return res.sendStatus(403);
  if (req.method !== 'GET' && !allowed(req.headers.origin)) return res.sendStatus(403);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (req, res) => res.json({ app: 'whatsapp-local', ready: true, instanceId: instance.id, running: state.running }));
app.use(express.static(path.join(root, 'public')));

let sock, generation = 0, reconnectTimer, connecting = false, clearing = false;
let saveChain = Promise.resolve();
let versionInfo;
let reconnectAttempts = 0;
let job = null;
const sentMessages = await createPersistentMessageCache(path.join(authDir, 'sent-messages.json'));
const store = openDatabase(path.join(root, 'data', 'whatsapp.sqlite'));
const state = { status: 'Desconectado', connectionIssue: null, qr: null, running: false, processed: 0, total: 0, success: 0, invalid: 0, errors: 0, nextAt: null,
  startedAt: null, finishedAt: null, contactStartedAt: null, processingMs: 0, timingSamples: 0, delayMin: 0, delayMax: 0 };
const history = store.logs();
function publish() { io.emit('state', state); }
function log(level, message) {
  const entry = { time: new Date().toISOString(), level, message };
  history.push(entry);
  if (history.length > 500) history.shift();
  try { store.addLog(entry); } catch(error) { console.error('Falha ao salvar log:',error.message); }
  io.emit('log', entry);
  if (level === 'error') console.error(message);
}
function stop(reason = 'Fila interrompida.') {
  if (job) { job.controller.abort(); log('info', reason); }
  state.nextAt = null;
  publish();
}

async function connect() {
  if (connecting || clearing || sock) return;
  connecting = true;
  const id = ++generation;
  try {
    if (!versionInfo || Date.now() - versionInfo.checkedAt > 3600000) {
      versionInfo = { ...await resolveVersion({ fallback: DEFAULT_CONNECTION_CONFIG.version }), checkedAt: Date.now() };
    }
    if (id !== generation) return;
    log('info', `Protocolo WhatsApp ${versionInfo.version.join('.')} (${versionInfo.source}).`);
    if (versionInfo.warning) log('error', `Não foi possível consultar a versão atual: ${versionInfo.warning}. Usando versão do pacote.`);
    const { state: auth, saveCreds } = await useMultiFileAuthState(authDir);
    if (id !== generation) return;
    const current = makeWASocket({
      auth, version: versionInfo.version, logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false, connectTimeoutMs: 30000,
      getMessage: async key => {
        const message = sentMessages.get(key);
        const reference = `ID ${key.id || 'ausente'} • conversa ${key.remoteJid || 'desconhecida'}`;
        if (!message) log('error', `Recuperação solicitada (${reference}): mensagem não encontrada no arquivo local. Pode ser anterior ao registro ou enviada por outro aparelho; esse pedido não será atendido.`);
        else log('info', `Recuperação solicitada (${reference}): conteúdo encontrado e disponibilizado ao Baileys para tentar reenviar.`);
        return message;
      },
    });
    sock = current;
    current.ev.on('messages.update', updates => {
      if(id!==generation)return;
      for(const {key,update} of updates)if(key.id&&typeof update.status==='number')store.receipt(key.id,update.status);
      io.emit('metrics-changed');
    });
    current.ev.on('messages.upsert', ({ messages }) => {
      if (id === generation) {
        for (const message of messages) void sentMessages.put(message).catch(error => log('error', `Falha ao arquivar mensagem para recuperação: ${error.message}`));
      }
    });
    current.ev.on('creds.update', () => {
      if (id === generation) saveChain = saveChain.then(saveCreds).catch(() => log('error', 'Falha ao salvar sessão.'));
    });
    current.ev.on('connection.update', async update => {
      if (id !== generation) return;
      if (update.qr) {
        try {
          const qr = await QRCode.toDataURL(update.qr);
          if (id !== generation || sock !== current || state.status === 'Conectado') return;
          state.qr = qr; state.status = 'Aguardando QR Code'; publish();
          reconnectAttempts = 0;
          log('info', 'QR Code gerado. Escaneie com o WhatsApp no celular.');
        } catch { log('error', 'Falha ao gerar QR Code.'); }
      }
      if (update.connection === 'open') {
        reconnectAttempts = 0;
        state.connectionIssue = null;
        state.status = 'Conectado'; state.qr = null; publish(); log('success', 'WhatsApp conectado.');
      }
      if (update.connection === 'close') {
        sock = null; state.status = 'Desconectado'; state.qr = null;
        stop('Conexão perdida; fila cancelada.'); publish();
        const code = update.lastDisconnect?.error?.output?.statusCode;
        const error = update.lastDisconnect?.error;
        const reason = error?.message || 'Sem detalhes';
        const remoteCode = error?.data?.attrs?.reason;
        log('error', `Conexão WhatsApp encerrada (código ${code ?? 'desconhecido'}${remoteCode ? `, motivo ${remoteCode}` : ''}): ${reason}`);
        if (code === DisconnectReason.connectionReplaced) {
          clearTimeout(reconnectTimer);
          state.connectionIssue = 'Conexão substituída por outra instância. Encerre a outra cópia e use Reiniciar WhatsApp.';
          publish();
          log('error', 'Conflito de sessão (440). Reconexão automática suspensa para não disputar a conexão. Encerre a outra cópia e use Reiniciar WhatsApp. Não é necessário apagar a sessão.');
        } else if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
          log('error', 'Sessão inválida. Use Desconectar / limpar sessão para gerar outro QR.');
        } else {
          if (code === 405 || remoteCode === '405') versionInfo = undefined;
          const seconds = code === DisconnectReason.restartRequired ? 1 : Math.min(30, 3 * 2 ** Math.min(reconnectAttempts++, 4));
          log('info', `Tentando reconectar em ${seconds} segundos…`);
          reconnectTimer = setTimeout(() => void connect(), seconds * 1000);
        }
      }
    });
  } catch (error) {
    state.status = 'Desconectado'; publish(); log('error', `Falha na conexão: ${error.message}`);
    reconnectTimer = setTimeout(() => void connect(), 5000);
  } finally { connecting = false; }
}

async function run(campaign, active) {
  const { signal } = active.controller;
  let failure = null;
  try {
    let image;
    if (campaign.imageUrl) {
      log('info', 'Baixando e validando a imagem antes dos envios…');
      image = await downloadImage(campaign.imageUrl, signal);
      log('info', 'Imagem pronta para envio.');
    }
    for (let i = 0; i < campaign.contacts.length; i++) {
      if (signal.aborted) break;
      const contact = campaign.contacts[i];
      state.nextAt = null;
      state.contactStartedAt = Date.now();
      publish();
      let outcome = { status: 'error' };
      try {
        if (!contact.number) {
          outcome = { status:'invalid', error:'Número inválido' };
          state.invalid++; log('invalid', `${i + 1}/${state.total} • ${contact.raw}: Número inválido`);
        } else {
          const current = sock;
          if (!current || state.status !== 'Conectado') throw new Error('WhatsApp desconectado');
          const [result] = await current.onWhatsApp(contact.number);
          if (signal.aborted) break;
          if (!result?.exists) {
            outcome = { status:'invalid', error:'Número sem WhatsApp' };
            state.invalid++; log('invalid', `${i + 1}/${state.total} • ${contact.number}: Número inválido / sem WhatsApp`);
          } else {
            const text = personalize(campaign.message, contact.vars);
            if (!text.trim()) throw new Error('Mensagem vazia após substituir variáveis');
            const sent = await current.sendMessage(result.jid, image
              ? { image, caption: text }
              : { text });
            // Falha no arquivo não altera o resultado de um envio já realizado.
            try { await sentMessages.put(sent); }
            catch (error) { log('error', `Envio realizado, mas não foi possível arquivar para recuperação: ${error.message}`); }
            state.success++; log('success', `${i + 1}/${state.total} • ${contact.number}: Sucesso (aceito pelo WhatsApp) • ID ${sent?.key?.id || 'não informado'}`);
            outcome = { status:'success', messageId:sent?.key?.id };
          }
        }
      } catch (error) {
        outcome = { status:'error', error:error.message };
        state.errors++; log('error', `${i + 1}/${state.total} • ${contact.raw}: Erro — ${error.message}`);
      }
      state.processingMs += Date.now() - state.contactStartedAt;
      store.record(active.id, i, {...outcome,durationMs:Date.now()-state.contactStartedAt});
      io.emit('metrics-changed');
      state.timingSamples++;
      state.contactStartedAt = null;
      state.processed = i + 1; publish();
      if (signal.aborted || i === campaign.contacts.length - 1) break;
      const delay = (campaign.min + Math.random() * (campaign.max - campaign.min)) * 1000;
      state.nextAt = Date.now() + delay; publish();
      await sleep(delay, undefined, { signal });
      state.nextAt = null;
    }
  } catch (error) {
    if(error.name!=='AbortError')failure=error.message;
    if (error.name !== 'AbortError') log('error', `Fila: ${error.message}`);
  } finally {
    if (job === active) {
      try { store.finish(active.id,signal.aborted?'stopped':failure?'failed':'completed',failure); }
      catch(error){log('error',`Falha ao finalizar histórico: ${error.message}`);}
      job = null; state.running = false; state.nextAt = null;
      state.contactStartedAt = null; state.finishedAt = Date.now(); publish();
      log(failure?'error':'info', signal.aborted ? 'Fila parada. Nenhum próximo envio será iniciado.' : failure?`Fila encerrada com erro: ${failure}`:'Fila concluída.');
      io.emit('metrics-changed');
    }
  }
}

io.on('connection', client => { client.emit('state', state); client.emit('history', history); });
app.post('/api/estimate', (req, res) => {
  try {
    if (typeof req.body?.contacts !== 'string') throw new Error('Informe os contatos.');
    const count = req.body.contacts.trim() ? parseContacts(req.body.contacts).length : 0;
    const sample=count?parseContacts(req.body.contacts)[0]:null;
    res.json({...estimateSchedule(count, Number(req.body.min), Number(req.body.max)),sample});
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/media/preview', async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    if (typeof req.body?.url !== 'string' || req.body.url.length > 8192) throw new Error('Informe um link válido de imagem ou Google Drive.');
    const image = await downloadImage(normalizeImageUrl(req.body.url.trim()), controller.signal);
    if (controller.signal.aborted) return;
    const mime = image[0] === 137 ? 'image/png' : image[0] === 255 ? 'image/jpeg' : 'image/webp';
    res.setHeader('Cache-Control', 'no-store');
    res.type(mime).send(image);
  } catch (error) {
    if (!controller.signal.aborted) res.status(400).json({ error: error.message });
  }
});
app.post('/api/start', (req, res) => {
  if (clearing || job) return res.status(409).json({ error: 'Aguarde a operação atual terminar.' });
  if (state.status !== 'Conectado') return res.status(409).json({ error: 'Conecte o WhatsApp primeiro.' });
  try {
    const campaign = validateCampaign(req.body);
    campaign.name=typeof req.body.name==='string'?req.body.name.trim().slice(0,100):'';
    const campaignId=store.create(campaign);
    job = { controller: new AbortController(), id:campaignId };
    Object.assign(state, { running: true, processed: 0, total: campaign.contacts.length, success: 0, invalid: 0, errors: 0, nextAt: null,
      startedAt: Date.now(), finishedAt: null, contactStartedAt: null, processingMs: 0, timingSamples: 0, delayMin: campaign.min, delayMax: campaign.max });
    state.campaignId=campaignId;
    io.emit('metrics-changed');
    publish(); log('info', `Fila iniciada: ${state.total} contatos.`);
    void run(campaign, job);
    res.json({ ok: true, campaignId });
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/api/stats', (req,res)=>{
  const year=Number(req.query.year||new Date().getFullYear());
  if(!Number.isInteger(year)||year<2000||year>2200)return res.status(400).json({error:'Ano inválido.'});
  res.json(store.stats(year));
});
app.get('/api/campaigns', (req,res)=>res.json(store.list({search:String(req.query.search||'').slice(0,100),status:String(req.query.status||''),page:Math.max(1,Math.min(100000,Number(req.query.page)||1))|0})));
app.get('/api/campaigns/:id/export', (req,res)=>{
  const campaign=store.detail(req.params.id);
  if(!campaign)return res.status(404).json({error:'Campanha não encontrada.'});
  res.setHeader('Content-Disposition',`attachment; filename="campanha-${campaign.id}.csv"`);
  res.type('text/csv').send(campaignCsv(campaign));
});
app.get('/api/campaigns/:id', (req,res)=>{
  const campaign=store.detail(req.params.id);
  if(!campaign)return res.status(404).json({error:'Campanha não encontrada.'});
  res.json(campaign);
});
app.delete('/api/campaigns/:id', (req,res)=>{
  try {
    if(!store.delete(req.params.id))return res.status(404).json({error:'Campanha não encontrada.'});
    io.emit('metrics-changed');res.json({ok:true});
  }catch(error){res.status(409).json({error:error.message});}
});
app.get('/api/database/export', (req,res)=>{
  res.setHeader('Content-Disposition','attachment; filename="whatsapp-historico.json"');
  res.json(store.export());
});
app.post('/api/connect', (req,res)=>{state.connectionIssue=null;void connect();res.json({ok:true});});
app.post('/api/stop', (req, res) => { stop(); res.json({ ok: true }); });
app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(shutdown, 150);
});
app.post('/api/disconnect', async (req, res) => {
  if (clearing || connecting) return res.status(409).json({ error: 'Conexão em transição. Tente novamente em instantes.' });
  clearing = true;
  clearTimeout(reconnectTimer); stop('Sessão desconectada; fila cancelada.');
  ++generation;
  const old = sock; sock = null;
  state.status = 'Desconectado'; state.qr = null; publish();
  try {
    if (old) {
      try { await Promise.race([old.logout(), sleep(5000)]); } catch { /* Sessão já desconectada. */ }
      old.end(undefined);
    }
    await saveChain;
    await sentMessages.clear();
    await rm(authDir, { recursive: true, force: true });
    log('info', 'Sessão local apagada. Gerando um novo QR Code.');
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: `Não foi possível limpar a sessão: ${error.message}` }); }
  finally { clearing = false; void connect(); }
});
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? 'Lista maior que 2 MB.' : 'Requisição inválida.' }));
http.listen(port, '127.0.0.1', () => { console.log(`Abra ${origin}`); void connect(); });
http.on('error', error => { console.error(error.message); process.exitCode = 1; });
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  ++generation; clearTimeout(reconnectTimer); stop('Servidor encerrando.');
  sock?.end(undefined); io.close(); http.close();
  void instance.release();
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
