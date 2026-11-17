export function normalizeImageUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use um link HTTP(S) de imagem ou Google Drive.');
  if (url.hostname === 'drive.google.com') {
    const id = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]
      || (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
    if (!id || !/^[\w-]+$/.test(id)) throw new Error('Link do Google Drive inválido. Use o link de um arquivo compartilhado.');
    const direct = new URL('https://drive.google.com/uc');
    direct.searchParams.set('export', 'download');
    direct.searchParams.set('id', id);
    if (url.searchParams.has('resourcekey')) direct.searchParams.set('resourcekey', url.searchParams.get('resourcekey'));
    return direct.href;
  }
  if (!/\.(jpe?g|png|webp)$/i.test(url.pathname)) throw new Error('Use um link direto de JPG, PNG, WebP ou um arquivo do Google Drive.');
  return url.href;
}

export async function downloadImage(url, signal, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  if (!response.ok) throw new Error(`Não foi possível baixar a imagem (HTTP ${response.status}). No Drive, habilite “Qualquer pessoa com o link”.`);
  const max = 10 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > max) throw new Error('A imagem excede o limite de 10 MB.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw new Error('A imagem excede o limite de 10 MB.');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpg && !webp) throw new Error('O link não retornou uma imagem PNG, JPG ou WebP. No Drive, confira a permissão “Qualquer pessoa com o link” e o acesso ao download.');
  return buffer;
}
