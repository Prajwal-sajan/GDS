#requires -Version 7
# Restarts the JourneyOS API locally (Development) in the background, logging to modern/api.log.
param([int]$Port = 5080)
Get-CimInstance Win32_Process -Filter "Name='dotnet.exe' OR Name='JourneyOS.Api.exe'" |
  Where-Object { $_.CommandLine -match 'JourneyOS.Api' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process JourneyOS.Api -ErrorAction SilentlyContinue | Stop-Process -Force
$root = Split-Path $PSScriptRoot -Parent
dotnet build "$root/backend/src/JourneyOS.Api" -c Debug -v q --nologo | Select-String -Pattern "error|Warn|Build succeeded" | Select-Object -First 10
$env:ASPNETCORE_ENVIRONMENT = "Development"
Start-Process dotnet -ArgumentList 'run', '--no-build', '--project', "$root/backend/src/JourneyOS.Api", '--urls', "http://localhost:$Port" `
  -RedirectStandardOutput "$root/api.log" -RedirectStandardError "$root/api.err" -WindowStyle Hidden
foreach ($i in 1..40) { Start-Sleep 1; try { $r = Invoke-RestMethod "http://localhost:$Port/health/ready" -TimeoutSec 3; Write-Host "API ready: $($r | ConvertTo-Json -Compress)"; exit 0 } catch {} }
Write-Host "API did not become ready; see $root/api.log"; exit 1
