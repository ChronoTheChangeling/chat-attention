# Build Foundry-installable zip + stamped module.json for releases.
# Usage: powershell -File scripts/pack.ps1 [-Version 0.1.0]

param(
  [string]$Version = "0.1.0",
  [string]$OwnerRepo = "ChronoTheChangeling/chat-attention"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "dist"
$stage = Join-Path $out "stage\chat-attention"

Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $stage "scripts") -Force | Out-Null

Copy-Item (Join-Path $root "scripts\main.mjs") (Join-Path $stage "scripts\main.mjs") -Force
Copy-Item (Join-Path $root "README.md") $stage -Force

$manifestUrl = "https://github.com/$OwnerRepo/releases/latest/download/module.json"
$downloadUrl = "https://github.com/$OwnerRepo/releases/latest/download/module.zip"

$raw = Get-Content (Join-Path $root "module.json") -Raw -Encoding utf8
$moduleJson = $raw | ConvertFrom-Json
$moduleJson.version = $Version
$moduleJson.url = "https://github.com/$OwnerRepo"
$moduleJson.readme = "https://github.com/$OwnerRepo#readme"
$moduleJson.bugs = "https://github.com/$OwnerRepo/issues"
$moduleJson.manifest = $manifestUrl
$moduleJson.download = $downloadUrl

$json = ($moduleJson | ConvertTo-Json -Depth 10)
[System.IO.File]::WriteAllText((Join-Path $stage "module.json"), $json + "`n", (New-Object System.Text.UTF8Encoding $false))
Copy-Item (Join-Path $stage "module.json") (Join-Path $out "module.json") -Force

$zipPath = Join-Path $out "module.zip"
Push-Location (Join-Path $out "stage")
Compress-Archive -Path "chat-attention" -DestinationPath $zipPath -Force
Pop-Location

Write-Host "Wrote:"
Write-Host "  $zipPath"
Write-Host "  $(Join-Path $out 'module.json')"
Write-Host ""
Write-Host "Manifest URL:"
Write-Host "  $manifestUrl"
