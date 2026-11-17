param(
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\WhatsAppLocal'),
    [switch]$Silent,
    [switch]$NoLaunch,
    [switch]$NoShortcuts
)
$ErrorActionPreference = 'Stop'
$expectedPayloadHash = '__PAYLOAD_SHA256__'
$payloadFile = Join-Path $PSScriptRoot 'payload.zip'
$temporaryInstall = $null
$progressForm = $null
$script:statusLabel = $null
$script:progressBar = $null
$installLock = $null
$installLocked = $false

function Set-Progress([int]$Percent, [string]$Text) {
    if ($script:statusLabel) {
        $script:statusLabel.Text = $Text
        $script:progressBar.Value = [Math]::Min(100, [Math]::Max(0, $Percent))
        [System.Windows.Forms.Application]::DoEvents()
    }
}

function Get-InstalledHealth([int]$AppPort, [string]$InstanceId) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/api/health" -TimeoutSec 1
        if ($health.app -eq 'whatsapp-local' -and $health.instanceId -eq $InstanceId) { return $health }
    } catch { }
    return $null
}

function Create-ClientShortcut([string]$LinkPath, [string]$Action, [string]$TargetDirectory) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($LinkPath)
    $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $shortcut.Arguments = '"' + (Join-Path $TargetDirectory $Action) + '"'
    $shortcut.WorkingDirectory = $TargetDirectory
    $shortcut.IconLocation = Join-Path $TargetDirectory 'assets\whatsapp.ico'
    $shortcut.Description = 'WhatsApp Local - campanhas e historico neste computador'
    $shortcut.Save()
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Este instalador requer Windows 10 ou 11 de 64 bits (x64).' }
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { throw 'Este pacote foi preparado para Windows x64. Solicite uma versao para ARM64.' }
    $destination = [System.IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
    if ($destination -eq [System.IO.Path]::GetPathRoot($destination).TrimEnd('\') -or $destination -eq $env:USERPROFILE) { throw 'Escolha uma pasta exclusiva para o aplicativo.' }
    $hashProvider = [Security.Cryptography.SHA256]::Create()
    try { $instanceId = [BitConverter]::ToString($hashProvider.ComputeHash([Text.Encoding]::UTF8.GetBytes($destination.ToLowerInvariant()))).Replace('-', '').Substring(0, 20) }
    finally { $hashProvider.Dispose() }
    $installLock = New-Object System.Threading.Mutex($false, "Local\WhatsAppInstaller_$instanceId")
    $installLocked = $installLock.WaitOne(0)
    if (-not $installLocked) { throw 'A instalacao ja esta em andamento. Aguarde a outra janela terminar.' }

    if (-not $Silent) {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        [System.Windows.Forms.Application]::EnableVisualStyles()
        $progressForm = New-Object System.Windows.Forms.Form
        $progressForm.Text = 'Instalando WhatsApp Local'
        $progressForm.Size = New-Object System.Drawing.Size(485, 180)
        $progressForm.StartPosition = 'CenterScreen'
        $progressForm.FormBorderStyle = 'FixedDialog'
        $progressForm.ControlBox = $false
        $title = New-Object System.Windows.Forms.Label
        $title.Text = 'WhatsApp Local'
        $title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
        $title.SetBounds(22, 15, 430, 30)
        $script:statusLabel = New-Object System.Windows.Forms.Label
        $script:statusLabel.SetBounds(24, 55, 425, 30)
        $script:progressBar = New-Object System.Windows.Forms.ProgressBar
        $script:progressBar.SetBounds(24, 95, 420, 18)
        $progressForm.Controls.AddRange(@($title, $script:statusLabel, $script:progressBar))
        $progressForm.Show()
    }
    Set-Progress 3 'Verificando a integridade do pacote...'
    if (-not (Test-Path -LiteralPath $payloadFile)) { throw 'O arquivo payload.zip nao foi encontrado. Extraia o ZIP completo antes de instalar.' }
    $actualHash = (Get-FileHash -LiteralPath $payloadFile -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedPayloadHash) { throw 'O pacote esta incompleto ou foi alterado. Solicite uma nova copia ao fornecedor.' }

    $temporaryInstall = Join-Path ([System.IO.Path]::GetTempPath()) ('WhatsAppLocal-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporaryInstall -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($payloadFile)
    try {
        $count = 0
        foreach ($entry in $archive.Entries) {
            $entryDestination = [System.IO.Path]::GetFullPath((Join-Path $temporaryInstall $entry.FullName))
            if (-not $entryDestination.StartsWith($temporaryInstall + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'O pacote possui um caminho invalido.' }
            if (-not $entry.Name) { New-Item -ItemType Directory -Path $entryDestination -Force | Out-Null }
            else {
                New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($entryDestination)) -Force | Out-Null
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $entryDestination, $true)
            }
            $count++
            if ($count % 80 -eq 0) { Set-Progress (5 + [int](30 * $count / [Math]::Max(1, $archive.Entries.Count))) 'Preparando os arquivos do aplicativo...' }
        }
    } finally { $archive.Dispose() }
    $manifest = Get-Content -LiteralPath (Join-Path $temporaryInstall 'distribution-manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.app -ne 'whatsapp-local' -or $manifest.platform -ne 'win32-x64') { throw 'O pacote nao corresponde ao aplicativo esperado.' }
    if ((Test-Path -LiteralPath (Join-Path $temporaryInstall 'auth')) -or (Test-Path -LiteralPath (Join-Path $temporaryInstall '.runtime'))) { throw 'O pacote nao e uma distribuicao limpa.' }
    foreach ($item in $manifest.files) {
        $sourceFile = [System.IO.Path]::GetFullPath((Join-Path $temporaryInstall $item.path))
        if (-not $sourceFile.StartsWith($temporaryInstall + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifesto invalido.' }
        if ((Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash -ne $item.sha256) { throw ('Falha na verificacao do arquivo: ' + $item.path) }
    }
    Set-Progress 42 'Preparando a instalacao...'
    if (Test-Path -LiteralPath $destination) {
        $knownInstall = (Test-Path -LiteralPath (Join-Path $destination 'installation.json'))
        if (-not $knownInstall -and (Get-ChildItem -LiteralPath $destination -Force | Select-Object -First 1)) { throw 'A pasta de destino ja contem arquivos e nao e uma instalacao reconhecida do WhatsApp Local.' }
    }
    $ports = @(3010..3020) + @(3000)
    $portFile = Join-Path $destination '.runtime\port.txt'
    if (Test-Path -LiteralPath $portFile) {
        $savedPort = 0
        if ([int]::TryParse((Get-Content -LiteralPath $portFile -Raw).Trim(), [ref]$savedPort)) { $ports = @($savedPort) + $ports }
    }
    foreach ($appPort in ($ports | Select-Object -Unique)) {
        $health = Get-InstalledHealth $appPort $instanceId
        if ($health) {
            if ($health.running) {
                if ($Silent) { throw 'Existe uma campanha ativa. Pare os disparos antes de atualizar.' }
                $answer = [System.Windows.Forms.MessageBox]::Show('Existe uma campanha ativa. Atualizar cancela os proximos envios. Deseja continuar?', 'WhatsApp Local', 'YesNo', 'Warning')
                if ($answer -ne 'Yes') { throw 'Atualizacao cancelada. Sua campanha continua em andamento.' }
            }
            Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$appPort/api/shutdown" -Headers @{ Origin = "http://localhost:$appPort" } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
            Start-Sleep -Seconds 2
            if (Get-InstalledHealth $appPort $instanceId) { throw 'O programa ainda esta encerrando. Aguarde e tente instalar novamente.' }
        }
    }
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $items = @(Get-ChildItem -LiteralPath $temporaryInstall -File -Recurse -Force)
    $copied = 0
    foreach ($item in $items) {
        $relative = $item.FullName.Substring($temporaryInstall.Length + 1)
        $target = [System.IO.Path]::GetFullPath((Join-Path $destination $relative))
        if (-not $target.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de instalacao invalido.' }
        $firstPart = $relative.Split('\')[0]
        if ($firstPart -in @('auth', '.runtime') -or ($relative.StartsWith('data\') -and $relative -ne 'data\README.md')) { throw 'O pacote tentou substituir dados do cliente.' }
        New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        Copy-Item -LiteralPath $item.FullName -Destination $target -Force
        $copied++
        if ($copied % 80 -eq 0) { Set-Progress (45 + [int](44 * $copied / [Math]::Max(1, $items.Count))) 'Instalando. Sua sessao e seu historico serao preservados...' }
    }
    @{ app = 'whatsapp-local'; version = $manifest.version; installedAt = (Get-Date).ToString('o'); directory = $destination } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'installation.json') -Encoding UTF8
    Set-Progress 94 'Criando os atalhos...'
    if (-not $NoShortcuts) {
        $desktop = [Environment]::GetFolderPath('DesktopDirectory')
        if ($desktop) { Create-ClientShortcut (Join-Path $desktop 'WhatsApp Local.lnk') 'Iniciar WhatsApp.vbs' $destination }
        $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'WhatsApp Local'
        New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
        Create-ClientShortcut (Join-Path $startMenu 'WhatsApp Local.lnk') 'Iniciar WhatsApp.vbs' $destination
        Create-ClientShortcut (Join-Path $startMenu 'Reiniciar WhatsApp.lnk') 'Reiniciar WhatsApp.vbs' $destination
        Create-ClientShortcut (Join-Path $startMenu 'Encerrar WhatsApp.lnk') 'Encerrar WhatsApp.vbs' $destination
    }
    Set-Progress 100 'Instalacao concluida!'
    if ($progressForm) { $progressForm.Close() }
    if (-not $NoLaunch) {
        Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + (Join-Path $destination 'Iniciar WhatsApp.vbs') + '"') -WindowStyle Hidden
    }
    if (-not $Silent) { [System.Windows.Forms.MessageBox]::Show('WhatsApp Local instalado! Use o atalho da Area de Trabalho. No primeiro acesso, conecte o seu proprio WhatsApp pelo QR Code.', 'WhatsApp Local', 'OK', 'Information') | Out-Null }
    Write-Output "Instalado em: $destination"
} catch {
    if ($progressForm) { $progressForm.Close() }
    if ($Silent) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'WhatsApp Local - Instalacao nao concluida', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($temporaryInstall -and (Test-Path -LiteralPath $temporaryInstall)) {
        $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryInstall)
        $temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($resolvedTemporary.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedTemporary).StartsWith('WhatsAppLocal-')) { Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force }
    }
    if ($installLocked) { $installLock.ReleaseMutex() }
    if ($installLock) { $installLock.Dispose() }
}
