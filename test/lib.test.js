import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, parseContacts, personalize, validateCampaign } from '../lib.js';

test('números com DDD e DDI preservam números válidos e rejeitam comprimentos incorretos', () => {
  assert.equal(normalizePhone('(11) 99999-9999'), '5511999999999');
  assert.equal(normalizePhone('+55 (21) 98888-8888'), '5521988888888');
  assert.equal(normalizePhone('(55) 99999-9999'), '5555999999999');
  assert.equal(normalizePhone('123'), null);
});
test('CSV suporta BOM, aspas, ponto e vírgula em campos e linhas vazias', () => {
  const contacts = parseContacts('\uFEFF5511999999999;João;"Plano; Pro"\r\n\r\n5521988888888;Maria');
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].vars[1], 'Plano; Pro');
  assert.equal(personalize('Olá {{nome}}, {{var2}} / {{var3}}', contacts[0].vars), 'Olá João, Plano; Pro / ');
  assert.equal(personalize('{{var1}} {{nome}}', ['$&']), '$& $&');
});
test('campanha rejeita intervalos e mídia inválidos antes de iniciar', () => {
  const body = { contacts: '11999999999;João', message: 'Olá {{nome}}', min: 5, max: 10 };
  assert.equal(validateCampaign(body).contacts.length, 1);
  for (const change of [{ min: 20 }, { min: 0 }, { max: Infinity }, { message: '' }, { imageUrl: 'file:///foto.jpg' }, { contacts: '' }]) {
    assert.throws(() => validateCampaign({ ...body, ...change }));
  }
  assert.equal(validateCampaign({ ...body, imageUrl: 'https://example.com/a.png?token=1' }).imageUrl, 'https://example.com/a.png?token=1');
});
