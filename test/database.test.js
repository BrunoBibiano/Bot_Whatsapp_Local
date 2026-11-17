import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase,campaignCsv} from '../database.js';

const campaign={name:'Campanha de teste',message:'Olá {{nome}}',imageUrl:'',min:5,max:10,contacts:[{number:'5511999999999',raw:'11999999999',vars:['João']},{number:null,raw:'123',vars:['=SUM(1;1)']}]};
test('banco registra resultados, recibos e métricas; exclusão em cascata remove campanha e contatos',()=>{
  const store=openDatabase(':memory:');
  try {
    const id=store.create(campaign);
    assert.throws(()=>store.delete(id),/Pare a campanha/);
    store.receipt('msg1',3); // Recibo pode chegar antes de sendMessage retornar.
    store.record(id,0,{status:'success',durationMs:1500,messageId:'msg1'});
    store.record(id,1,{status:'invalid',durationMs:5,error:'Número inválido'});
    store.finish(id,'completed');
    const detail=store.detail(id);
    assert.equal(detail.success,1);assert.equal(detail.invalid,1);assert.equal(detail.processed,2);
    assert.equal(detail.recipients[0].delivery,'delivered');
    store.receipt('msg1',4);store.receipt('msg1',3);
    assert.equal(store.detail(id).recipients[0].delivery,'read');
    const stats=store.stats(new Date().getFullYear());
    assert.equal(stats.sent,1);assert.equal(stats.avg_send_ms,1500);assert.equal(stats.delivered,1);
    assert.equal(stats.monthly.reduce((sum,m)=>sum+m.sent,0),1);
    assert.equal(stats.annual.reduce((sum,m)=>sum+m.sent,0),1);
    assert.equal(store.list({search:'teste'}).total,1);
    assert.equal(store.list({search:'inexistente'}).total,0);
    assert.match(campaignCsv(detail),/'=SUM/);
    assert.equal(store.export().recipients.length,2);
    store.delete(id);
    assert.equal(store.stats().sent,0);assert.equal(store.export().recipients.length,0);
  }finally{store.close();}
});
test('reabrir o banco preserva envios e marca campanha em curso como interrompida sem retomar',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'whatsapp-db-'));
  let store;
  try {
    const file=path.join(dir,'test.sqlite');store=openDatabase(file);
    const id=store.create(campaign);
    store.record(id,0,{status:'success',durationMs:2000,messageId:'persisted'});
    store.addLog({time:new Date().toISOString(),level:'info',message:'Log persistido'});
    store.close();store=openDatabase(file);
    const detail=store.detail(id);
    assert.equal(detail.status,'interrupted');assert.equal(detail.success,1);
    assert.equal(detail.recipients[1].status,'cancelled');assert.ok(detail.finished_at);
    assert.equal(store.logs()[0].message,'Log persistido');
    assert.ok(store.stats().sizeBytes>0);
  }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});
