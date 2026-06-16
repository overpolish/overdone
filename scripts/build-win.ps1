<#
.SYNOPSIS
    Builds the Windows distributables for Overdone and stages them as .zip files
    for Payhip (which accepts .zip but not raw .exe).

.DESCRIPTION
    Produces two artifacts in distribution/:

      Overdone_<version>_Setup.zip     The NSIS installer (.exe), zipped. This is
                                       the normal "install it" download: per-user
                                       install, no admin rights required.

      Overdone_<version>_Portable.zip  The standalone overdone.exe, zipped. No
                                       installation needed -- unzip and run. Use
                                       this where installs aren't permitted.

    Both rely on the system WebView2 runtime, which is preinstalled on Windows 11
    and present on virtually all Windows 10 machines (it ships via Windows Update).
    The rare machine without it gets the free Microsoft runtime: the NSIS
    installer downloads it automatically; for the portable exe the user installs
    the Evergreen runtime once from Microsoft.

    Mirrors scripts/build-and-sign-mac.sh, which does the equivalent .dmg -> .zip
    staging on macOS.

.NOTES
    Run from anywhere; the script cd's to the repo root itself.
#>

# Stop on the first error and treat unset variables / non-zero native exit codes
# as failures, so a broken build never silently produces a stale zip.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Repo root = parent of this script's directory. Resolve it up front so every
# path below is absolute and independent of the caller's working directory.
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

# Read the product version from the single source of truth (tauri.conf.json) so
# the zip names always match the build without a second place to bump.
$conf = Get-Content (Join-Path $Root 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$version = $conf.version
Write-Host "Building Overdone $version for Windows..." -ForegroundColor Cyan

# Collect the finished archives here under friendly names. Gitignored; this is
# what you upload for distribution.
$DistDir = Join-Path $Root 'distribution'
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

# Build the NSIS installer. This also compiles the standalone release exe that
# the portable zip reuses (tauri build always produces target\release\overdone.exe
# before bundling), so one build covers both artifacts.
Write-Host "`n=== Running tauri build (nsis) ===" -ForegroundColor Cyan
pnpm tauri build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw "tauri build failed (exit $LASTEXITCODE)" }

$ReleaseDir = Join-Path $Root 'src-tauri\target\release'

# --- Installer zip ---------------------------------------------------------
# Tauri names the NSIS output Overdone_<version>_<arch>-setup.exe. Grab the
# newest match rather than hardcoding the arch token.
$nsis = Get-ChildItem (Join-Path $ReleaseDir 'bundle\nsis\*-setup.exe') |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsis) { throw "No NSIS installer found under bundle\nsis." }

$setupZip = Join-Path $DistDir "Overdone_${version}_Setup.zip"
Write-Host "`nZipping installer -> $(Split-Path $setupZip -Leaf)..." -ForegroundColor Cyan
if (Test-Path $setupZip) { Remove-Item $setupZip }
Compress-Archive -Path $nsis.FullName -DestinationPath $setupZip

# --- Portable zip ----------------------------------------------------------
# The standalone exe is fully portable: Tauri embeds the frontend assets into the
# binary, so there are no loose files to ship. We stage it under a versioned
# folder name so the zip extracts to a tidy directory rather than a bare exe.
$portableExe = Join-Path $ReleaseDir 'overdone.exe'
if (-not (Test-Path $portableExe)) { throw "No portable exe at $portableExe." }

$stage = Join-Path $DistDir "Overdone_${version}_Portable"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
# Use the product name for the user-facing exe inside the zip.
Copy-Item $portableExe (Join-Path $stage 'Overdone.exe')

$portableZip = Join-Path $DistDir "Overdone_${version}_Portable.zip"
Write-Host "Zipping portable -> $(Split-Path $portableZip -Leaf)..." -ForegroundColor Cyan
if (Test-Path $portableZip) { Remove-Item $portableZip }
Compress-Archive -Path $stage -DestinationPath $portableZip
Remove-Item $stage -Recurse -Force

Write-Host "`nDone. Distributable .zips are in:" -ForegroundColor Green
Write-Host "  distribution\"
Get-ChildItem (Join-Path $DistDir '*.zip') | ForEach-Object { Write-Host "  $($_.Name)" }
