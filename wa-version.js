// Consulta apenas dados do repositório oficial; nenhum código remoto é executado.
export function parseVersion(value) {
  const parts = value.split(',').map(part => part.trim());
  if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part))) throw new Error('WA_VERSION deve ter o formato 2,3000,1234567890.');
  const version = parts.map(Number);
  if (version.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error('WA_VERSION inválida.');
  return version;
}

export async function resolveVersion({ fallback, override = process.env.WA_VERSION, fetcher = fetch }) {
  if (override) return { version: parseVersion(override), source: 'WA_VERSION' };
  try {
    const response = await fetcher('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/index.ts', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const match = text.match(/const version\s*=\s*\[\s*(\d+),\s*(\d+),\s*(\d+)\s*\]/);
    if (!match) throw new Error('Versão ausente na fonte oficial');
    return { version: parseVersion(match.slice(1).join(',')), source: 'repositório oficial' };
  } catch (error) {
    return { version: fallback, source: 'pacote instalado', warning: error.message };
  }
}
