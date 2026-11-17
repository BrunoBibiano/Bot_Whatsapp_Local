$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectDir 'assets'
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$green = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#25D366'))
$white = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 10)
$phonePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 19)
$phonePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$phonePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$bubble = New-Object System.Drawing.Drawing2D.GraphicsPath
$phone = New-Object System.Drawing.Drawing2D.GraphicsPath
$stream = New-Object System.IO.MemoryStream
try {
    $graphics.FillEllipse($green, 8, 8, 240, 240)
    $bubble.AddArc(42, 35, 174, 174, 138, 310)
    $bubble.AddLine(128, 209, 45, 225)
    $bubble.AddLine(45, 225, 59, 174)
    $graphics.DrawPath($white, $bubble)
    $phone.AddBezier(89, 77, 68, 105, 117, 170, 159, 176)
    $graphics.DrawPath($phonePen, $phone)
    $graphics.DrawLine($phonePen, 89, 77, 103, 101)
    $graphics.DrawLine($phonePen, 159, 176, 174, 161)
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $stream.ToArray()
    $iconPath = Join-Path $assetsDir 'whatsapp.ico'
    $file = [System.IO.File]::Create($iconPath)
    $writer = New-Object System.IO.BinaryWriter($file)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
        $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
    } finally { $writer.Dispose() }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $projectDir 'WhatsApp.lnk'))
    $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $shortcut.Arguments = '"' + (Join-Path $projectDir 'Iniciar WhatsApp.vbs') + '"'
    $shortcut.WorkingDirectory = $projectDir
    $shortcut.IconLocation = $iconPath
    $shortcut.Description = 'Iniciar WhatsApp e abrir o aplicativo'
    $shortcut.Save()
    Write-Output 'Atalho WhatsApp.lnk e icone criados.'
} finally {
    $stream.Dispose(); $phone.Dispose(); $bubble.Dispose(); $phonePen.Dispose(); $white.Dispose(); $green.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
