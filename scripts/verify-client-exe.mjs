import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyClientExe(exe, installerDirectory, scratch) {
  const bytes = await fs.readFile(exe);
  if(bytes.toString('ascii',0,2)!=='MZ')throw new Error('Executável Windows inválido.');
  if(!bytes.includes(Buffer.from('asInvoker')))throw new Error('O executável não declara instalação sem elevação.');
  let offset=-1;
  for(let position=bytes.indexOf('MSCF');position>=0;position=bytes.indexOf('MSCF',position+4)){
    if(position+36>bytes.length)continue;
    const size=bytes.readUInt32LE(position+8);
    if(bytes.readUInt32LE(position+4)===0 && bytes.readUInt32LE(position+12)===0 && bytes.readUInt32LE(position+20)===0 && bytes[position+24]===3 && bytes[position+25]===1 && size>36 && position+size<=bytes.length){offset=position;break;}
  }
  if(offset<0)throw new Error('Conteúdo CAB do instalador não encontrado.');
  const directory=path.join(scratch,'exe-check-'+randomUUID());
  const extracted=path.join(directory,'extracted');
  await fs.mkdir(extracted,{recursive:true});
  const cabinet=path.join(directory,'package.cab');
  await fs.writeFile(cabinet,bytes.subarray(offset,offset+bytes.readUInt32LE(offset+8)));
  await new Promise((resolve,reject)=>{
    const process=spawn('expand.exe',[cabinet,'-F:*',extracted],{windowsHide:true,stdio:'ignore'});
    process.on('error',reject);process.on('close',code=>code===0?resolve():reject(new Error('Falha ao extrair e verificar o conteúdo do EXE.')));
  });
  for(const file of ['payload.zip','Install-Client.ps1','Instalar WhatsApp.vbs']){
    const actual=await fs.readFile(path.join(extracted,file));
    const expected=await fs.readFile(path.join(installerDirectory,file));
    if(sha(actual)!==sha(expected))throw new Error(`Arquivo do EXE não confere: ${file}`);
  }
  return {valid:true,bytes:bytes.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const latestFile=path.join(root,'.distribution','latest-build.json');
  const latest=JSON.parse(await fs.readFile(latestFile,'utf8'));
  const exe=path.join(root,'release',`WhatsApp-Local-${latest.version}-Setup.exe`);
  const result=await verifyClientExe(exe,latest.installer,path.join(root,'.distribution'));
  latest.exe=exe;await fs.writeFile(latestFile,JSON.stringify(latest,null,2));
  const artifacts=[latest.outputZip,exe],sums=[];
  for(const artifact of artifacts)sums.push(`${sha(await fs.readFile(artifact))}  ${path.basename(artifact)}`);
  await fs.writeFile(path.join(root,'release','SHA256SUMS.txt'),sums.join('\r\n')+'\r\n');
  console.log(`EXE validado: MZ, nível asInvoker e os três arquivos internos conferidos (${(result.bytes/1024/1024).toFixed(1)} MB).`);
}
