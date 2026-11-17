import { parse } from 'csv-parse/sync';
import { normalizeImageUrl } from './media.js';

export function normalizePhone(raw) {
  let number = raw.replace(/\D/g, '');
  if (number.length === 10 || number.length === 11) number = '55' + number;
  return /^55[1-9]\d{9,10}$/.test(number) ? number : null;
}

export function parseContacts(text) {
  const rows = parse(text.replace(/^\uFEFF/, ''), {
    delimiter: ';', skip_empty_lines: true, relax_column_count: true, trim: true,
  });
  if (!rows.length || rows.length > 10000) throw new Error('Informe entre 1 e 10.000 contatos, sem cabeçalho.');
  return rows.map(([raw, ...vars]) => ({ raw, number: normalizePhone(raw), vars }));
}

export function personalize(template, vars) {
  return template.replace(/\{\{\s*(nome|var([1-9]\d*))\s*\}\}/gi,
    (_, key, index) => vars[key.toLowerCase() === 'nome' ? 0 : Number(index) - 1] ?? '');
}

export function validateCampaign(body) {
  if (!body || typeof body.contacts !== 'string' || typeof body.message !== 'string') throw new Error('Contatos e mensagem são obrigatórios.');
  if (!body.message.trim() || body.message.length > 4000) throw new Error('A mensagem deve ter entre 1 e 4.000 caracteres.');
  const min = Number(body.min), max = Number(body.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > 3600) throw new Error('Use intervalos entre 1 e 3.600 segundos, com máximo ≥ mínimo.');
  const inputUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const imageUrl = inputUrl ? normalizeImageUrl(inputUrl) : '';
  return { contacts: parseContacts(body.contacts), message: body.message, imageUrl, min, max };
}
