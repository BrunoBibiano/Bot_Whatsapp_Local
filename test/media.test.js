import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImageUrl, downloadImage } from '../media.js';

test('link compartilhado do Drive é convertido e mantém resourcekey', () => {
  assert.equal(normalizeImageUrl('https://drive.google.com/file/d/EXEMPLO_ARQUIVO_ID/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=EXEMPLO_ARQUIVO_ID');
  assert.equal(new URL(normalizeImageUrl('https://drive.google.com/open?id=abc&resourcekey=xyz')).searchParams.get('resourcekey'), 'xyz');
  assert.throws(() => normalizeImageUrl('https://drive.google.com/drive/folders/abc'));
});
test('download rejeita página HTML do Drive e aceita bytes PNG', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(downloadImage('https://example.com', signal, async () => new Response('<html>Login</html>')), /não retornou uma imagem/);
  const bytes = Buffer.from([137,80,78,71,13,10,26,10,0]);
  assert.deepEqual(await downloadImage('https://example.com', signal, async () => new Response(bytes)), bytes);
  await assert.rejects(downloadImage('https://example.com', signal, async () => new Response('', { status: 403 })), /HTTP 403/);
  await assert.rejects(downloadImage('https://example.com', signal, async () => new Response('', { headers: { 'content-length': String(11 * 1024 * 1024) } })), /10 MB/);
});
