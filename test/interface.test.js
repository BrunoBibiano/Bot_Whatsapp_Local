import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {act} from 'react';

test('interface WhatsApp navega, personaliza temas, simula entrada CSV e consulta histórico sem disparar',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:3010'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const requests=[];
  globalThis.fetch=async(url,options={})=>{
    requests.push({url,options});
    let result={};
    if(url.startsWith('/api/stats'))result={sent:10,campaigns:2,avg_send_ms:1500,delivered:3,errors:0,monthly:Array.from({length:12},(_,i)=>({month:i+1,sent:i===10?10:0,avg_send_ms:i===10?1500:null})),annual:[{year:2026,sent:10}],recent:[]};
    if(url.startsWith('/api/campaigns'))result={items:[],total:0,page:1,pages:1};
    if(url==='/api/estimate'){
      const hasContacts=!!JSON.parse(options.body).contacts.trim();
      result={count:hasContacts?1:0,averageMs:0,minimumMs:0,maximumMs:0,sample:hasContacts?{number:'5511999999999',vars:['João']}:null};
    }
    if(url==='/api/media/preview')return {ok:true,blob:async()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'})};
    return {ok:true,json:async()=>result};
  };
  const dir=await mkdtemp(path.join(process.cwd(),'.test-runtime-'));
  try {
    const compiled=await build({entryPoints:['frontend/main.jsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom/client','react/jsx-runtime','lucide-react'],plugins:[{name:'fake-socket',setup(build){build.onResolve({filter:/^socket.io-client$/},()=>({path:'socket',namespace:'fake'}));build.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:`export function io(){const s={on(event,fn){if(event==='connect')fn();if(event==='state')fn({status:'Conectado',running:false,total:0,processed:0});return s;},disconnect(){}};return s;}`,loader:'js'}));}}]});
    const file=path.join(dir,'app.mjs');await writeFile(file,compiled.outputFiles[0].text);
    await act(async()=>{await import(pathToFileURL(file));});
    const click=async element=>{assert.ok(element);await act(async()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
    const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
    assert.match(document.querySelector('h1').textContent,/Cada envio/);
    assert.match(document.body.textContent,/1,5s/);
    await click(document.querySelector('[aria-label="Aparência & Temas"]'));
    await click(button('Emerald Finance'));
    assert.equal(document.documentElement.style.getPropertyValue('--bg-primary'),'#0B1310');
    assert.equal(JSON.parse(localStorage.getItem('whatsapp-theme')).id,'emerald');
    const color=document.getElementById('--bg-primary');
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(color,'#102030');color.dispatchEvent(new dom.window.Event('input',{bubbles:true}));color.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    assert.equal(document.documentElement.style.getPropertyValue('--bg-primary'),'#102030');
    await click(button('Restaurar Padrão'));
    assert.equal(document.documentElement.style.getPropertyValue('--bg-primary'),'#13111C');
    await click(document.querySelector('[aria-label="Novo disparo"]'));
    assert.ok(document.getElementById('contacts'));assert.ok(document.getElementById('imageUrl'));
    assert.equal(document.getElementById('min').value,'5');
    async function setInput(id,value){await act(async()=>{
      const input=document.getElementById(id);
      const prototype=input.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,value);
      input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    });}
    await setInput('contacts','5511999999999;João');
    await setInput('message','Olá *{{nome}}*! _Tudo bem?_\n~Antes~ `código` <script>alert(1)</script> https://example.com');
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,450));});
    assert.equal(document.querySelector('.wa-chat-person strong').textContent,'João');
    assert.equal(document.querySelector('.wa-message-text strong').textContent,'João');
    assert.equal(document.querySelector('.wa-message-text em').textContent,'Tudo bem?');
    assert.equal(document.querySelector('.wa-message-text s').textContent,'Antes');
    assert.equal(document.querySelector('.wa-message-text code').textContent,'código');
    assert.equal(document.querySelector('.wa-message-text script'),null);
    assert.match(document.querySelector('.wa-message-text').textContent,/<script>/);
    assert.equal(document.querySelector('.wa-message-text a').getAttribute('href'),'https://example.com');
    await setInput('imageUrl','https://example.com/photo.png');
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,800));});
    assert.match(document.querySelector('.wa-media img').getAttribute('src'),/^blob:/);
    assert.match(document.querySelector('.wa-message-text').textContent,/Olá João/);
    assert.ok(requests.some(r=>r.url==='/api/media/preview'));
    await click(document.querySelector('[aria-label="Histórico & Banco local"]'));
    assert.match(document.body.textContent,/SQLite em data\/whatsapp.sqlite/);
    assert.ok(document.querySelector('a[href="/api/database/export"]'));
    assert.equal(requests.some(r=>r.url==='/api/start'),false);
  }finally{
    await act(async()=>{document.getElementById('root').replaceChildren();});dom.window.close();
    await rm(dir,{recursive:true,force:true});delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
