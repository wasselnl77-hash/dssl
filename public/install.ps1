# DSSL installer for Windows. PowerShell 5.1 or newer, no admin rights needed.
#
#   irm https://dssl-sable.vercel.app/install.ps1 | iex
#
# Drops a dssl-engine folder into your current directory.

$ErrorActionPreference = "Stop"

$Base = "https://dssl-sable.vercel.app"
$Dest = Join-Path (Get-Location).Path "dssl-engine"

# some Windows PowerShell 5.1 installs still default to ancient TLS; be explicit
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

Write-Host "fetching the DSSL engine..."
$Zip = Join-Path ([IO.Path]::GetTempPath()) "dssl-engine.zip"
Invoke-WebRequest -Uri "$Base/dssl-engine.zip" -OutFile $Zip -UseBasicParsing

if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }

$Stage = Join-Path ([IO.Path]::GetTempPath()) ("dssl-unpack-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
Expand-Archive -Path $Zip -DestinationPath $Stage -Force
Move-Item -Path (Join-Path $Stage "dssl-engine") -Destination $Dest -Force
Remove-Item -Recurse -Force $Stage
Remove-Item -Force $Zip

Write-Host ""
Write-Host "DSSL engine installed to $Dest"
Write-Host ""
Write-Host "next: open USAGE.md in that folder. It is two tags and one example file."
