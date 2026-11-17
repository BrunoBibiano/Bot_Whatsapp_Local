param([Parameter(Mandatory=$true)][string]$SourceDirectory, [Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$archive = [System.IO.Path]::GetFullPath($ArchivePath)
if ($archive.StartsWith($source.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'O ZIP deve ficar fora da pasta de origem.' }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $archive, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Write-Output "Arquivo criado: $archive"
