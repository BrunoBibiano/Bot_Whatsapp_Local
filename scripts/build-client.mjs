import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { verifyClientExe } from './verify-client-exe.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = path.join(root, '.distribution');
const cache = path.join(scratch, 'cache');
const release = path.join(root, 'release');
const nodeVersion = '24.14.1';
const nodeFilename = `node-v${nodeVersion}-win-x64.zip`;
const sourceFiles = [
  'server.js','database.js','lib.js','media.js','message-cache.js','instance-lock.js','wa-version.js',
  'package.json','package-lock.json','Iniciar WhatsApp.vbs','Reiniciar WhatsApp.vbs','Encerrar WhatsApp.vbs',
  'scripts/Start-WhatsApp.ps1','scripts/diagnose-whatsapp.js','shared/estimate.js','assets/whatsapp.ico','data/README.md',
];

function run(command, args, cwd = root, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: capture ? ['ignore','pipe','pipe'] : 'inherit' });
    let output = '';
    if (capture) { child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data); }
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} terminou com código ${code}. ${output}`)));
  });
}
const npm = (args, cwd = root) => run(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c',`npm.cmd ${args.join(' ')}`],cwd);
const powershell = (args,capture = false) => run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass',...args],root,capture);
async function hash(file) { const digest=createHash('sha256'); for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex'); }
async function walk(directory, prefix = '') {
  const result=[];
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const relative=path.posix.join(prefix,item.name);
    if(item.isSymbolicLink())throw new Error(`Link simbólico não permitido no pacote: ${relative}`);
    if(item.isDirectory())result.push(...await walk(path.join(directory,item.name),relative));
    else result.push(relative);
  }
  return result.sort();
}
async function zip(directory, output) { await powershell(['-File',path.join(root,'scripts','pack-client.ps1'),'-SourceDirectory',directory,'-ArchivePath',output]); }
async function copyRelative(relative, app) {
  const target=path.join(app,relative);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(path.join(root,relative),target);
}

if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Gere este pacote em Windows x64.');
await fs.mkdir(cache,{recursive:true});await fs.mkdir(release,{recursive:true});
const buildDirectory=path.join(scratch,`build-${randomUUID()}`);
const app=path.join(buildDirectory,'app');
const installer=path.join(buildDirectory,'installer');
await fs.mkdir(app,{recursive:true});await fs.mkdir(installer,{recursive:true});
const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
console.log('1/7 Compilando a interface do WhatsApp...');
await npm(['run','build']);
console.log('2/7 Preparando somente arquivos permitidos, sem sessão ou banco...');
for(const relative of sourceFiles)await copyRelative(relative,app);
await fs.cp(path.join(root,'public'),path.join(app,'public'),{recursive:true});
console.log('3/7 Instalando as dependências de produção isoladamente...');
await npm(['ci','--omit=dev','--no-audit','--no-fund'],app);
console.log('4/7 Preparando o Node.js oficial para o computador do cliente...');
const base=`https://nodejs.org/dist/v${nodeVersion}/`;
const sumsResponse=await fetch(base+'SHASUMS256.txt',{signal:AbortSignal.timeout(30000)});
if(!sumsResponse.ok)throw new Error(`Node.js: falha ao consultar hashes oficiais (HTTP ${sumsResponse.status}).`);
const sums=await sumsResponse.text();
const expected=sums.split(/\r?\n/).map(line=>line.trim().split(/\s+/)).find(parts=>parts[1]===nodeFilename)?.[0];
if(!expected||!/^[a-f0-9]{64}$/i.test(expected))throw new Error('A versão do Node.js não tem hash oficial disponível.');
const nodeArchive=path.join(cache,nodeFilename);
let cached=false;
try{cached=(await hash(nodeArchive))===expected;}catch{}
if(!cached){
  const response=await fetch(base+nodeFilename,{signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw new Error(`Falha ao baixar Node.js (HTTP ${response.status}).`);
  const partial=nodeArchive+'.part';
  const {createWriteStream}=await import('node:fs');
  await pipeline(Readable.fromWeb(response.body),createWriteStream(partial));
  if(await hash(partial)!==expected)throw new Error('O download do Node.js não confere com o SHA-256 oficial.');
  await fs.rename(partial,nodeArchive);
}
const extracted=path.join(buildDirectory,'node');
await powershell(['-File',path.join(root,'scripts','expand-client.ps1'),'-ArchivePath',nodeArchive,'-DestinationPath',extracted]);
const official=path.join(extracted,`node-v${nodeVersion}-win-x64`);
await fs.mkdir(path.join(app,'runtime'),{recursive:true});
await fs.copyFile(path.join(official,'node.exe'),path.join(app,'runtime','node.exe'));
await fs.copyFile(path.join(official,'LICENSE'),path.join(app,'runtime','LICENSE-node.txt'));
await fs.writeFile(path.join(app,'runtime','NODE-SOURCE.txt'),`Node.js ${nodeVersion}\n${base+nodeFilename}\nSHA256: ${expected}\n`);
await fs.writeFile(path.join(app,'LEIA-ME.txt'),`WHATSAPP LOCAL ${metadata.version}\r\n\r\nUse o atalho WhatsApp Local na Area de Trabalho.\r\nA primeira conexao pede o QR Code da sua propria conta.\r\nO Node.js e as dependencias ja estao incluidos.\r\nO programa precisa de internet para usar o WhatsApp.\r\n\r\nSEUS DADOS\r\nO historico fica na pasta data e sua sessao na pasta auth.\r\nNao compartilhe essas pastas. Para atualizar, execute o novo instalador;\r\na instalacao preserva sua sessao e seu historico.\r\nFechar o navegador nao encerra o servidor. Use Encerrar WhatsApp no menu Iniciar.\r\n\r\nLICENCAS\r\nAplicativo independente e nao oficial do WhatsApp/Meta.\r\nLicencas das bibliotecas acompanham as pastas node_modules e runtime.\r\n`);
const files=await walk(app);
if(files.some(file=>/^(auth|\.runtime)\//.test(file)||/^data\/(?!README\.md$)/.test(file)||/\.sqlite(?:-|$)/.test(file)||file==='.env'))throw new Error('Dados privados detectados: geração interrompida.');
const inventory=[];
for(const file of files)inventory.push({path:file,sha256:await hash(path.join(app,file))});
const manifest={app:'whatsapp-local',version:metadata.version,platform:'win32-x64',nodeVersion,createdAt:new Date().toISOString(),files:inventory};
await fs.writeFile(path.join(app,'distribution-manifest.json'),JSON.stringify(manifest,null,2));
console.log('5/7 Criando pacote limpo e instalador com verificação de integridade...');
const payload=path.join(installer,'payload.zip');await zip(app,payload);
const payloadHash=await hash(payload);
const installTemplate=await fs.readFile(path.join(root,'scripts','Install-Client.ps1'),'utf8');
await fs.writeFile(path.join(installer,'Install-Client.ps1'),'\uFEFF'+installTemplate.replace('__PAYLOAD_SHA256__',payloadHash));
await fs.writeFile(path.join(installer,'Instalar WhatsApp.vbs'),`Option Explicit\r\nDim shell, files, folder, command\r\nSet shell = CreateObject("WScript.Shell")\r\nSet files = CreateObject("Scripting.FileSystemObject")\r\nfolder = files.GetParentFolderName(WScript.ScriptFullName)\r\ncommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & folder & "\\Install-Client.ps1" & Chr(34)\r\nshell.Run command, 0, True\r\n`);
await fs.writeFile(path.join(installer,'LEIA-ME-PRIMEIRO.txt'),`WHATSAPP LOCAL - INSTALACAO WINDOWS 10/11 X64\r\n\r\n1. Extraia TODOS os arquivos deste ZIP.\r\n2. De dois cliques em Instalar WhatsApp.vbs.\r\n3. Aguarde a instalacao. O aplicativo sera aberto automaticamente.\r\n4. Conecte o SEU WhatsApp pelo QR Code.\r\n\r\nDepois, use o atalho WhatsApp Local na Area de Trabalho.\r\nNao precisa instalar Node.js, abrir terminal ou usar VS Code.\r\nInstalacao para o usuario atual, sem pedir administrador.\r\nPara atualizar, use o novo instalador; o historico e a sessao sao preservados.\r\nNao envie suas pastas auth e data a outras pessoas.\r\n`);
const outputZip=path.join(release,`WhatsApp-Local-${metadata.version}-Windows-x64.zip`);
await zip(installer,outputZip);
console.log('6/7 Gerando executável de instalação do Windows...');
const exe=path.join(release,`WhatsApp-Local-${metadata.version}-Setup.exe`);
const sed=path.join(buildDirectory,'installer.sed');
await fs.writeFile(sed,`[Version]\r\nClass=IEXPRESS\r\nSEDVersion=3\r\n[Options]\r\nPackagePurpose=InstallApp\r\nShowInstallProgramWindow=0\r\nHideExtractAnimation=0\r\nUseLongFileName=1\r\nInsideCompressed=0\r\nCAB_FixedSize=0\r\nCAB_ResvCodeSigning=0\r\nRebootMode=N\r\nInstallPrompt=\r\nDisplayLicense=\r\nFinishMessage=\r\nTargetName=${exe}\r\nFriendlyName=WhatsApp Local\r\nAppLaunched=wscript.exe "Instalar WhatsApp.vbs"\r\nPostInstallCmd=<None>\r\nAdminQuietInstCmd=\r\nUserQuietInstCmd=\r\nSourceFiles=SourceFiles\r\n[Strings]\r\nFILE0="payload.zip"\r\nFILE1="Install-Client.ps1"\r\nFILE2="Instalar WhatsApp.vbs"\r\n[SourceFiles]\r\nSourceFiles0=${installer}\\\r\n[SourceFiles0]\r\n%FILE0%=\r\n%FILE1%=\r\n%FILE2%=\r\n`);
let executableReady=false;
try{
  await run(path.join(process.env.WINDIR,'System32','iexpress.exe'),['/N','/Q',sed],buildDirectory);
  await verifyClientExe(exe,installer,scratch);
  executableReady=true;
}catch(error){console.warn(`Instalador EXE indisponível: ${error.message}. O ZIP permanece completo e instalável.`);}
const artifacts=[outputZip,...(executableReady?[exe]:[])];
const checksums=[];
for(const artifact of artifacts)checksums.push(`${await hash(artifact)}  ${path.basename(artifact)}`);
await fs.writeFile(path.join(release,'SHA256SUMS.txt'),checksums.join('\r\n')+'\r\n');
await fs.writeFile(path.join(scratch,'latest-build.json'),JSON.stringify({version:metadata.version,buildDirectory,app,installer,payload,outputZip,exe:executableReady?exe:null},null,2));
console.log('7/7 Pronto. Pacote sem auth, banco de clientes ou logs do desenvolvedor.');
for(const artifact of artifacts)console.log(`${artifact} (${((await fs.stat(artifact)).size/1024/1024).toFixed(1)} MB)`);
