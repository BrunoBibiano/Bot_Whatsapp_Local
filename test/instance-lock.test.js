import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireInstanceLock } from '../instance-lock.js';

test('segunda instância da mesma pasta é bloqueada e pode iniciar após liberar', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'whatsapp-lock-'));
  let lock;
  try {
    lock = await acquireInstanceLock(dir);
    await assert.rejects(acquireInstanceLock(dir), /já está aberto/);
    await lock.release(); lock = null;
    lock = await acquireInstanceLock(dir);
  } finally { if (lock) await lock.release(); await rm(dir, { recursive: true, force: true }); }
});
