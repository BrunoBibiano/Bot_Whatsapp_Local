import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseTokens,presets,loadTheme,validHex} from '../frontend/themes.js';
test('todos os presets preenchem os tokens; tema salvo e dados inválidos são tratados',()=>{
  assert.equal(presets.length,5);
  for(const p of presets)for(const key of Object.keys(baseTokens))assert.ok(validHex(p.tokens[key]));
  assert.equal(loadTheme({getItem:()=>JSON.stringify({id:'ocean',tokens:presets[2].tokens})}).id,'ocean');
  assert.equal(loadTheme({getItem:()=>'{oops'}).id,'purple');
  assert.equal(loadTheme({getItem:()=>JSON.stringify({id:'ocean',tokens:{'--bg-primary':'url(bad)'}})}).tokens['--bg-primary'],baseTokens['--bg-primary']);
});
