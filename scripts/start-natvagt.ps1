<#
  Starter hele natvagten: bygger hvis noedvendigt, holder PC'en vaagen,
  aabner skaermen i kiosk-tilstand og genstarter serveren, hvis den doer.

  Brug:  start.bat                 (dobbeltklik)
         start.bat -Autostart      (start automatisk ved hver Windows-login)
         start.bat -FjernAutostart
#>
param(
  [switch]$Autostart,
  [switch]$FjernAutostart,
  [switch]$UdenBrowser
)

$ErrorActionPreference = 'Stop'
$rod = Split-Path -Parent $PSScriptRoot
Set-Location $rod
$opgave = 'VASE Natvagt'

if ($FjernAutostart) {
  Unregister-ScheduledTask -TaskName $opgave -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Autostart fjernet.'
  exit 0
}

if ($Autostart) {
  $handling = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$rod\start.bat`"" -WorkingDirectory $rod
  $udloeser = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $indst = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $opgave -Action $handling -Trigger $udloeser -Settings $indst -Force | Out-Null
  Write-Host "Autostart sat: natvagten starter naar $env:USERNAME logger ind."
  exit 0
}

# --- konfiguration -----------------------------------------------------------
$port = 8477
if (Test-Path .env) {
  $linje = Get-Content .env | Where-Object { $_ -match '^\s*NATVAGT_PORT\s*=' } | Select-Object -First 1
  if ($linje) { $port = [int](($linje -split '=', 2)[1].Trim()) }
}
$adresse = "http://localhost:$port/"

# --- hold PC'en vaagen (kun mens scriptet koerer paa lysnettet) ---------------
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null

# --- byg, hvis skaermen mangler ---------------------------------------------
if (-not (Test-Path display\dist\index.html) -or -not (Test-Path admin\dist\index.html)) {
  Write-Host 'Bygger skaerm og admin ...'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Bygget fejlede.' }
}

# --- en instans ad gangen ----------------------------------------------------
$optaget = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($optaget) {
  Write-Host "Port $port er optaget - koerer natvagten allerede? Lukker ikke noget." -ForegroundColor Yellow
  exit 1
}

# --- aabn skaermen -----------------------------------------------------------
function Aabn-Skaerm {
  $kandidater = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  $browser = $kandidater | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $browser) { Write-Host "Ingen Chrome/Edge fundet - aabn $adresse selv."; return }
  $profil = Join-Path $env:TEMP 'natvagt-browser'
  Start-Process $browser -ArgumentList "--kiosk", $adresse, "--user-data-dir=$profil", "--no-first-run",
    "--disable-session-crashed-bubble", "--noerrdialogs", "--autoplay-policy=no-user-gesture-required"
}

# --- koer for evigt: doer serveren, startes den igen -------------------------
Write-Host "VASE Natvagt koerer paa $adresse  (Ctrl+C lukker den)" -ForegroundColor Green
$foerste = $true
while ($true) {
  $server = Start-Process npm.cmd -ArgumentList 'start' -NoNewWindow -PassThru
  if ($foerste -and -not $UdenBrowser) {
    Start-Sleep -Seconds 4
    Aabn-Skaerm
    $foerste = $false
  }
  $server.WaitForExit()
  Write-Host "$(Get-Date -Format 'HH:mm:ss') Serveren stoppede (kode $($server.ExitCode)) - starter igen om 2 sek." -ForegroundColor Yellow
  Start-Sleep -Seconds 2
}

