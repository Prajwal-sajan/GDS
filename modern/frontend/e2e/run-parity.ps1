param([string[]]$Specs = @('shell','fleet','trips','schedules','schedule-overlay','settings','comms','crm','staff','routes'), [int]$Timeout = 300)
$Specs = $Specs | ForEach-Object { $_ -split ',' } | Where-Object { $_ }
$out = 'D:\GDS\modern\frontend\e2e\par-sum.txt'
Set-Content $out ''
foreach ($s in $Specs) {
  $j = Start-Job -ArgumentList $s {
    param($s)
    Set-Location D:\GDS\modern\frontend
    npx playwright test -c playwright.parity.config.ts "$s.parity" --reporter=line 2>&1 |
      Select-String '^\s+\d+ (passed|failed|flaky)|^\s+\d+\) \[' | ForEach-Object { $_.Line.Trim() }
  }
  if (Wait-Job $j -Timeout $Timeout) { $line = "$s :: " + ((Receive-Job $j) -join ' ; ') }
  else { Stop-Job $j; $line = "$s :: TIMEOUT" }
  Add-Content $out $line
  $line
}
'ALL_DONE'
