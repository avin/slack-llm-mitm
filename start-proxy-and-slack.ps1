$ErrorActionPreference = 'SilentlyContinue'

# Debug mode: true - show console windows, false - hide
$DebugMode = $false

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$envFile = Join-Path $scriptDir '.env'
$proxyPort = $null
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*PROXY_PORT\s*=\s*(\d+)\s*$') {
            $proxyPort = [int]$Matches[1]
            break
        }
    }
}
if (-not $proxyPort) {
    Write-Error "Could not find PROXY_PORT in the .env file"
    exit 1
}

$pidFile = Join-Path $scriptDir 'proxy.pid'

if (Test-Path $pidFile) {
    $oldPid = (Get-Content $pidFile).Trim()
    if ($oldPid -match '^\d+$') {
        Get-Process -Id $oldPid -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Get-Process -Name slack -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue | Out-Null

# Waiting before starting a new process
Start-Sleep -Seconds 3

# Start proxy
if ($DebugMode) {
    $proxyProcess = Start-Process -FilePath 'node' `
        -ArgumentList 'index.js' `
        -WorkingDirectory $scriptDir `
        -PassThru
} else {
    $proxyProcess = Start-Process -FilePath 'node' `
        -ArgumentList 'index.js' `
        -WorkingDirectory $scriptDir `
        -WindowStyle Hidden `
        -PassThru
}

# Save proxy PID
$proxyProcess.Id | Out-File -FilePath $pidFile -Encoding ASCII

# Find the latest Slack version
$slackBase = Join-Path $env:LOCALAPPDATA 'slack'
$appDirs = Get-ChildItem -Directory $slackBase | Where-Object Name -like 'app-*'
$latest = $appDirs |
    Sort-Object @{ Expression = { [version]($_.Name -replace '^app-','') } } -Descending |
    Select-Object -First 1
$slackExe = Join-Path $latest.FullName 'slack.exe'

# Launch Slack with proxy
if ($DebugMode) {
    Start-Process -FilePath $slackExe `
        -ArgumentList "--proxy-server=`"http://127.0.0.1:$proxyPort`""
} else {
    Start-Process -FilePath $slackExe `
        -ArgumentList "--proxy-server=`"http://127.0.0.1:$proxyPort`"" `
        -WindowStyle Hidden
}