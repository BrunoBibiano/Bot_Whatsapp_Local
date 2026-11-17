import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageCache, createPersistentMessageCache } from '../message-cache.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('recuperação retorna o conteúdo original enviado e limita memória', () => {
  const cache = createMessageCache(2);
  const outgoing = id => ({ key: { id, fromMe: true }, message: { conversation: `Olá ${id}` } });
  const first = outgoing('a');
  cache.put(first);
  assert.deepEqual(cache.get({ id: 'a' }), first.message);
  cache.put({ key: { id: 'a', fromMe: false }, message: { conversation: 'recebida' } });
  assert.deepEqual(cache.get({ id: 'a' }), first.message);
  cache.put(outgoing('b')); cache.put(outgoing('c'));
  assert.equal(cache.get({ id: 'a' }), undefined);
  assert.deepEqual(cache.get({ id: 'c' }), { conversation: 'Olá c' });
  cache.clear();
  assert.equal(cache.get({ id: 'c' }), undefined);
});

test('mensagem com mídia pode ser recuperada após reabrir o arquivo; limpar remove conteúdo', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'whatsapp-cache-'));
  try {
    const file = path.join(dir, 'messages.json');
    const cache = await createPersistentMessageCache(file, 2);
    await cache.put({ key: { id: 'media1', fromMe: true }, message: { imageMessage: { caption: 'Olá', mediaKey: Buffer.from([1, 2, 3]), url: 'https://example.com/image.jpg' } } });
    const reopened = await createPersistentMessageCache(file, 2);
    assert.equal(reopened.get({ id: 'media1' }).imageMessage.caption, 'Olá');
    assert.deepEqual(Buffer.from(reopened.get({ id: 'media1' }).imageMessage.mediaKey), Buffer.from([1, 2, 3]));
    await reopened.clear();
    const empty = await createPersistentMessageCache(file, 2);
    assert.equal(empty.get({ id: 'media1' }), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
