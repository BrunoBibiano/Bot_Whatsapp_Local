param([switch]$NoBrowser, [switch]$Restart, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir '.runtime'
$serverPath = Join-Path $projectDir 'server.js'
$mutex = $null
$locked = $false

function Get-AppHealth([int]$AppPort) {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/api/health" -TimeoutSec 1
        return ($response.app -eq 'whatsapp-local' -and $response.ready -eq $true -and $response.instanceId -eq $projectKey)
    } catch { return $false }
}

function Open-App([int]$AppPort) {
    $address = "http://localhost:$AppPort"
    if (-not $NoBrowser) { Start-Process $address }
    Write-Output $address
}

try {
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { $projectKey = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectDir.ToLowerInvariant()))).Replace('-', '').Substring(0, 20) }
    finally { $hash.Dispose() }
    $mutex = New-Object System.Threading.Mutex($false, "Local\WhatsAppLocal_$projectKey")
    $locked = $mutex.WaitOne(0)
    if (-not $locked) { return }
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

    # Procura tambem um servidor iniciado manualmente, sem arquivo port.txt.
    $portFile = Join-Path $runtimeDir 'port.txt'
    $portsToCheck = @(3000) + @(3010..3020)
    if (Test-Path -LiteralPath $portFile) {
        $savedPort = 0
        if ([int]::TryParse((Get-Content -LiteralPath $portFile -Raw).Trim(), [ref]$savedPort)) {
            $portsToCheck = @($savedPort) + $portsToCheck
        }
    }
    foreach ($existingPort in ($portsToCheck | Select-Object -Unique)) {
        if (Get-AppHealth $existingPort) {
            if (-not $Restart -and -not $Stop) { Open-App $existingPort; return }
            Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$existingPort/api/shutdown" -Headers @{ Origin = "http://localhost:$existingPort" } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
            Start-Sleep -Seconds 2
            if (Get-AppHealth $existingPort) { throw 'O servidor ainda esta encerrando. Aguarde e tente reiniciar novamente.' }
            if ($Stop) { Write-Output 'WhatsApp Local encerrado.'; return }
        }
    }
    if ($Stop) { Write-Output 'WhatsApp Local ja esta encerrado.'; return }

    $bundledNode = Join-Path $projectDir 'runtime\node.exe'
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } elseif ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (-not (Test-Path -LiteralPath $nodePath)) { throw 'O Node.js nao esta instalado. Solicite a instalacao do Node.js 22 ou superior neste computador.' }
    $nodeVersion = & $nodePath --version
    if ([version]$nodeVersion.TrimStart('v') -lt [version]'22.13.0') { throw 'Atualize o Node.js para a versao 22.13 ou superior (recomendado: Node.js 24).' }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'public\index.html'))) {
        throw 'A interface ainda nao foi compilada. Solicite a compilacao do aplicativo antes de iniciar.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules\express\package.json'))) {
        throw 'A instalacao do aplicativo esta incompleta. Solicite a instalacao das dependencias antes de iniciar.'
    }

    $selectedPort = $null
    foreach ($candidate in 3010..3020) {
        $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidate)
        try { $probe.Start(); $selectedPort = $candidate; break }
        catch { continue }
        finally { $probe.Stop() }
    }
    if (-not $selectedPort) { throw 'As portas locais estao ocupadas. Reinicie o computador e tente novamente.' }

    $previousPort = $env:PORT
    try {
        $env:PORT = [string]$selectedPort
        $process = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverPath + '"')) -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')
    } finally { $env:PORT = $previousPort }
    $process.Id | Set-Content -LiteralPath (Join-Path $runtimeDir 'server.pid')
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        $process.Refresh()
        if ($process.HasExited) { throw 'O servidor nao conseguiu iniciar. Consulte o arquivo .runtime\server-error.log ou envie esse arquivo ao suporte.' }
        if (Get-AppHealth $selectedPort) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'O programa demorou para iniciar. Aguarde alguns segundos e abra o atalho novamente.' }
    [string]$selectedPort | Set-Content -LiteralPath $portFile
    Open-App $selectedPort
} catch {
    if (Test-Path -LiteralPath $runtimeDir) { $_.Exception.Message | Add-Content -LiteralPath (Join-Path $runtimeDir 'launcher-error.log') }
    if ($NoBrowser) { throw }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'WhatsApp - Nao foi possivel iniciar', 'OK', 'Error') | Out-Null
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
