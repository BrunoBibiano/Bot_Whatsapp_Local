import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, resolveVersion } from '../wa-version.js';

test('versão oficial é extraída como dados e override é validado', async () => {
  assert.deepEqual(parseVersion('2, 3000, 1234567890'), [2, 3000, 1234567890]);
  assert.throws(() => parseVersion('2,3000,NaN'));
  const result = await resolveVersion({ fallback: [2, 3000, 1], override: '', fetcher: async () => ({ ok: true, text: async () => 'const version = [2, 3000, 999]' }) });
  assert.deepEqual(result.version, [2, 3000, 999]);
});
test('falha de rede ou resposta inválida usa fallback com aviso', async () => {
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => ({ ok: true, text: async () => 'sem versão' })]) {
    const result = await resolveVersion({ fallback: [2, 3000, 1], override: '', fetcher });
    assert.deepEqual(result.version, [2, 3000, 1]);
    assert.ok(result.warning);
  }
});
