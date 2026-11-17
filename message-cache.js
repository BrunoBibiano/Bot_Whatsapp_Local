import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { proto } from '@whiskeysockets/baileys';

export function createMessageCache(limit = 2000) {
  const messages = new Map();
  return {
    put(message) {
      if (!message?.key?.id || !message?.message || !message.key.fromMe) return;
      const key = message.key.id;
      messages.delete(key);
      messages.set(key, message.message);
      while (messages.size > limit) messages.delete(messages.keys().next().value);
    },
    get(key) { return messages.get(key.id); },
    entries() { return [...messages.entries()]; },
    clear() { messages.clear(); },
  };
}

export async function createPersistentMessageCache(file, limit = 2000) {
  const cache = createMessageCache(limit);
  try {
    const entries = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('Formato inválido do cache de mensagens.');
    for (const [id, encoded] of entries.slice(-limit)) {
      cache.put({ key: { id, fromMe: true }, message: proto.Message.decode(Buffer.from(encoded, 'base64')) });
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let writes = Promise.resolve();
  function persist() {
    const operation = writes.catch(() => {}).then(async () => {
      const data = cache.entries().map(([id, message]) => [id, Buffer.from(proto.Message.encode(message).finish()).toString('base64')]);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
      await rename(file + '.tmp', file);
    });
    writes = operation;
    return operation;
  }
  return {
    async put(message) {
      if (!message?.key?.fromMe || !message?.key?.id || !message?.message) return;
      cache.put(message);
      await persist();
    },
    get: key => cache.get(key),
    async clear() { cache.clear(); await persist(); },
  };
}
