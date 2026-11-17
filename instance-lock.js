import net from 'node:net';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';

export function instanceId(root) {
  let resolved = realpathSync(root);
  if (process.platform === 'win32') resolved = resolved.toLowerCase();
  return createHash('sha256').update(resolved).digest('hex').slice(0, 20);
}

export async function acquireInstanceLock(root) {
  const id = instanceId(root);
  // Named pipe é liberado pelo Windows até se o processo for encerrado à força.
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\whatsapp-local-${id}` : path.join(root, '.whatsapp-instance.sock');
  const server = net.createServer(client => client.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, () => { server.removeListener('error', reject); resolve(); });
  }).catch(error => {
    if (['EADDRINUSE', 'EACCES'].includes(error.code)) throw new Error('Este aplicativo já está aberto. Use o atalho WhatsApp ou Reiniciar WhatsApp; não inicie outro servidor com a mesma sessão.');
    throw error;
  });
  server.unref();
  return { id, release: () => new Promise(resolve => server.close(resolve)) };
}
