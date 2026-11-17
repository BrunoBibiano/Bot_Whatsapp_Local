$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$latest = Get-Content -LiteralPath (Join-Path $projectDir '.distribution\latest-build.json') -Raw | ConvertFrom-Json
$clientDir = Join-Path $projectDir '.distribution\client-smoke'
$powershellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$clientLauncher = Join-Path $clientDir 'scripts\Start-WhatsApp.ps1'
if (-not (Test-Path -LiteralPath (Join-Path $clientDir 'installation.json'))) {
    & $powershellExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $latest.installer 'Install-Client.ps1') -InstallDirectory $clientDir -Silent -NoLaunch -NoShortcuts
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao de teste falhou.' }
}
if (Test-Path -LiteralPath (Join-Path $clientDir 'auth')) { throw 'Teste inicial exige instalacao limpa, sem sessao previa.' }
if (Test-Path -LiteralPath (Join-Path $clientDir 'data\whatsapp.sqlite')) { throw 'Banco pessoal encontrado na instalacao inicial.' }
$nodePath = Join-Path $clientDir 'runtime\node.exe'
Write-Output ('Node incluido: ' + (& $nodePath --version))
$previousPath = $env:PATH
try {
    $env:PATH = "$env:WINDIR\System32;$env:WINDIR\System32\WindowsPowerShell\v1.0"
    & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $clientLauncher -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'O iniciador nao abriu sem Node no PATH.' }
} finally { $env:PATH = $previousPath }
try {
    $clientPort = [int](Get-Content -LiteralPath (Join-Path $clientDir '.runtime\port.txt') -Raw).Trim()
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$clientPort/api/health" -TimeoutSec 5
    if ($health.app -ne 'whatsapp-local') { throw 'Resposta de saude inesperada.' }
    $stats = Invoke-RestMethod -Uri "http://127.0.0.1:$clientPort/api/stats" -TimeoutSec 5
    if ($stats.sent -ne 0 -or $stats.campaigns -ne 0) { throw 'O cliente recebeu historico do desenvolvedor.' }
    $clientProcessId = [int](Get-Content -LiteralPath (Join-Path $clientDir '.runtime\server.pid') -Raw).Trim()
    $executable = (Get-Process -Id $clientProcessId).Path
    if ($executable -ne $nodePath) { throw 'O servidor nao utilizou o Node incluido.' }
    $page = Invoke-WebRequest -Uri "http://127.0.0.1:$clientPort/" -UseBasicParsing -TimeoutSec 5
    if ($page.StatusCode -ne 200 -or $page.Content -notlike '*WhatsApp Local*') { throw 'A interface instalada nao respondeu.' }
    Write-Output 'OK: aplicativo abre com Node proprio, pagina e banco vazio; sem Node no PATH.'
} finally {
    & $powershellExe -NoProfile -ExecutionPolicy Bypass -File $clientLauncher -Stop -NoBrowser
}
Start-Sleep -Seconds 1
New-Item -ItemType Directory -Path (Join-Path $clientDir 'auth') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $clientDir 'auth\client-test.txt') -Value 'sessao-ficticia-preservar'
Set-Content -LiteralPath (Join-Path $clientDir 'data\client-test.txt') -Value 'historico-ficticio-preservar'
Set-Content -LiteralPath (Join-Path $clientDir '.runtime\client-test.txt') -Value 'registro-ficticio-preservar'
$databaseFile = Join-Path $clientDir 'data\whatsapp.sqlite'
$beforeHash = (Get-FileHash -LiteralPath $databaseFile -Algorithm SHA256).Hash
& $powershellExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $latest.installer 'Install-Client.ps1') -InstallDirectory $clientDir -Silent -NoLaunch -NoShortcuts
if ($LASTEXITCODE -ne 0) { throw 'Reinstalacao de teste falhou.' }
foreach ($relative in @('auth\client-test.txt','data\client-test.txt','.runtime\client-test.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $clientDir $relative))) { throw "A atualizacao apagou $relative" }
}
if ((Get-FileHash -LiteralPath $databaseFile -Algorithm SHA256).Hash -ne $beforeHash) { throw 'A atualizacao substituiu o banco do cliente.' }
Write-Output 'OK: reinstalacao preservou sessao ficticia, registros e banco SQLite byte a byte.'
