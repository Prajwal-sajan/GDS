# Bounded command runner: never blocks the terminal longer than -Timeout seconds.
# Runs the command in a child pwsh, streams output to a log file, kills the whole process tree on timeout,
# and prints only the tail (optionally filtered). Usage:
#   pwsh -File modern/scripts/run-bounded.ps1 -Cwd D:\GDS\modern\frontend -Timeout 240 -Cmd "npx playwright test ..." -Match "passed|failed"
param(
  [Parameter(Mandatory)] [string] $Cmd,
  [string] $Cwd = (Get-Location).Path,
  [int] $Timeout = 180,
  [string] $Match = "",
  [int] $Tail = 40
)
$log = Join-Path $env:TEMP ("bounded-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".log")
$wrapped = "Set-Location '$Cwd'; `$ProgressPreference='SilentlyContinue'; & { $Cmd } *>&1 | Out-File -Encoding utf8 '$log'; exit `$LASTEXITCODE"
$p = Start-Process pwsh -ArgumentList "-NoProfile", "-NonInteractive", "-Command", $wrapped -PassThru -WindowStyle Hidden
if (-not $p.WaitForExit($Timeout * 1000)) {
  & taskkill /PID $p.Id /T /F *> $null
  "TIMEOUT after ${Timeout}s (process tree killed). Log: $log"
} else { "exit=$($p.ExitCode) log=$log" }
if (Test-Path $log) {
  $lines = Get-Content $log
  if ($Match) { $lines = $lines | Where-Object { $_ -match $Match } }
  $lines | Select-Object -Last $Tail | ForEach-Object { if ($_.Length -gt 240) { $_.Substring(0, 240) } else { $_ } }
}
