import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), {
    recursive: true
  });
  const db = new DatabaseSync(file);
  const earlyReceipts = new Map();
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, total INTEGER NOT NULL,
      message TEXT NOT NULL, image_url TEXT NOT NULL, delay_min REAL NOT NULL, delay_max REAL NOT NULL,
      started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT
    );
    CREATE TABLE IF NOT EXISTS recipients (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, number TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      duration_ms INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, error TEXT, message_id TEXT,
      delivery TEXT NOT NULL DEFAULT 'unknown', PRIMARY KEY(campaign_id,position)
    );
    CREATE INDEX IF NOT EXISTS recipients_message ON recipients(message_id);
    CREATE INDEX IF NOT EXISTS recipients_date ON recipients(updated_at,status);
    CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, time TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL);
    PRAGMA user_version=1;`);
  // Nunca retomar automaticamente uma campanha após queda de energia/processo.
  const interruptedAt = Date.now();
  db.prepare("UPDATE recipients SET status='cancelled' WHERE status='pending' AND campaign_id IN (SELECT id FROM campaigns WHERE status='running')").run();
  db.prepare("UPDATE campaigns SET status='interrupted',finished_at=?,error='Servidor encerrado antes da conclusão; fila não retomada.' WHERE status='running'").run(interruptedAt);
  const summarySql = `SELECT c.*, COUNT(CASE WHEN r.status='success' THEN 1 END) AS success,
    COUNT(CASE WHEN r.status='invalid' THEN 1 END) AS invalid, COUNT(CASE WHEN r.status='error' THEN 1 END) AS errors,
    COUNT(CASE WHEN r.status IN ('success','invalid','error') THEN 1 END) AS processed,
    COUNT(CASE WHEN r.delivery IN ('delivered','read') THEN 1 END) AS delivered,
    AVG(CASE WHEN r.status='success' THEN r.duration_ms END) AS avg_send_ms
    FROM campaigns c LEFT JOIN recipients r ON r.campaign_id=c.id`;
  return {
    create(campaign) {
      const id = randomUUID(),
        at = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO campaigns(id,name,status,total,message,image_url,delay_min,delay_max,started_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, campaign.name || `Campanha ${new Date(at).toLocaleString('pt-BR')}`, 'running', campaign.contacts.length, campaign.message, campaign.imageUrl, campaign.min, campaign.max, at);
        const insert = db.prepare('INSERT INTO recipients(campaign_id,position,number,name) VALUES(?,?,?,?)');
        campaign.contacts.forEach((c, i) => insert.run(id, i, c.number || c.raw, c.vars[0] || ''));
        db.exec('COMMIT');
        return id;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    record(id, position, result) {
      db.prepare('UPDATE recipients SET status=?,duration_ms=?,updated_at=?,error=?,message_id=? WHERE campaign_id=? AND position=?').run(result.status, result.durationMs, Date.now(), result.error || null, result.messageId || null, id, position);
      if (result.messageId && earlyReceipts.has(result.messageId)) {
        this.receipt(result.messageId, earlyReceipts.get(result.messageId));
        earlyReceipts.delete(result.messageId);
      }
    },
    receipt(id, status) {
      const delivery = status >= 4 ? 'read' : status >= 3 ? 'delivered' : null;
      if (delivery) {
        earlyReceipts.set(id, Math.max(status, earlyReceipts.get(id) || 0));
        while (earlyReceipts.size > 5000) earlyReceipts.delete(earlyReceipts.keys().next().value);
        db.prepare("UPDATE recipients SET delivery=? WHERE message_id=? AND delivery!='read'").run(delivery, id);
      }
    },
    finish(id, status, error = null) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE campaigns SET status=?,finished_at=?,error=? WHERE id=?').run(status, Date.now(), error, id);
        db.prepare("UPDATE recipients SET status='cancelled' WHERE campaign_id=? AND status='pending'").run(id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    list({
      search = '',
      status = '',
      page = 1
    } = {}) {
      const filter = ' WHERE (? = \'\' OR c.name LIKE ?) AND (? = \'\' OR c.status = ?)';
      const args = [search, `%${search}%`, status, status];
      const total = db.prepare('SELECT COUNT(*) AS count FROM campaigns c' + filter).get(...args).count;
      const items = db.prepare(summarySql + filter + ' GROUP BY c.id ORDER BY c.started_at DESC LIMIT 20 OFFSET ?').all(...args, (page - 1) * 20);
      return {
        items,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / 20))
      };
    },
    detail(id) {
      const campaign = db.prepare(summarySql + ' WHERE c.id=? GROUP BY c.id').get(id);
      return campaign ? {
        ...campaign,
        recipients: db.prepare('SELECT * FROM recipients WHERE campaign_id=? ORDER BY position').all(id)
      } : null;
    },
    delete(id) {
      const campaign = db.prepare('SELECT status FROM campaigns WHERE id=?').get(id);
      if (campaign?.status === 'running') throw new Error('Pare a campanha antes de excluir.');
      return db.prepare('DELETE FROM campaigns WHERE id=?').run(id).changes > 0;
    },
    stats(year = new Date().getFullYear()) {
      const totals = db.prepare(`SELECT COUNT(*) AS campaigns,
        (SELECT COUNT(*) FROM recipients WHERE status='success') AS sent,
        (SELECT COUNT(*) FROM recipients WHERE status='error') AS errors,
        (SELECT COUNT(*) FROM recipients WHERE status='invalid') AS invalid,
        (SELECT COUNT(*) FROM recipients WHERE delivery IN ('delivered','read')) AS delivered,
        (SELECT AVG(duration_ms) FROM recipients WHERE status='success') AS avg_send_ms FROM campaigns`).get();
      const monthly = db.prepare(`SELECT CAST(strftime('%m',updated_at/1000,'unixepoch','-3 hours') AS INTEGER) AS month,
        COUNT(*) AS sent,AVG(duration_ms) AS avg_send_ms FROM recipients WHERE status='success'
        AND strftime('%Y',updated_at/1000,'unixepoch','-3 hours')=? GROUP BY month`).all(String(year));
      const annual = db.prepare(`SELECT CAST(strftime('%Y',updated_at/1000,'unixepoch','-3 hours') AS INTEGER) AS year,
        COUNT(*) AS sent,AVG(duration_ms) AS avg_send_ms FROM recipients WHERE status='success' GROUP BY year ORDER BY year`).all();
      const months = Array.from({
        length: 12
      }, (_, i) => monthly.find(m => m.month === i + 1) || {
        month: i + 1,
        sent: 0,
        avg_send_ms: null
      });
      return {
        ...totals,
        year,
        monthly: months,
        annual,
        recent: this.list().items.slice(0, 5),
        sizeBytes: file === ':memory:' ? 0 : statSync(file).size
      };
    },
    addLog(entry) {
      db.prepare('INSERT INTO logs(time,level,message) VALUES(?,?,?)').run(entry.time, entry.level, entry.message);
      db.exec('DELETE FROM logs WHERE id <= (SELECT MAX(id)-10000 FROM logs)');
    },
    logs() {
      return db.prepare('SELECT time,level,message FROM (SELECT * FROM logs ORDER BY id DESC LIMIT 500) ORDER BY id').all();
    },
    export() {
      return {
        format: 'whatsapp-local-v1',
        exportedAt: new Date().toISOString(),
        campaigns: db.prepare('SELECT * FROM campaigns').all(),
        recipients: db.prepare('SELECT * FROM recipients').all()
      };
    },
    close() {
      db.close();
    }
  };
}
export function campaignCsv(campaign) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [['Número', 'Nome', 'Status', 'Tempo (ms)', 'Entrega', 'ID da mensagem', 'Erro'], ...campaign.recipients.map(r => [r.number, r.name, r.status, r.duration_ms, r.delivery, r.message_id, r.error])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
