#requires -Version 7
# End-to-end RedBus inbound smoke flow against a locally running JourneyOS API.
# Usage: pwsh modern/scripts/redbus-smoke.ps1 [-Base http://localhost:5080] [-Secret <inbound secret>]
param([string]$Base = "http://localhost:5080", [string]$Secret = "", [string]$AdminKey = "dev-owner-key")
$ErrorActionPreference = "Stop"
$h = @{}; if ($Secret) { $h["X-GDS-Key"] = $Secret }
$adm = @{ "X-Admin-Key" = $AdminKey }
function Step($name, [scriptblock]$__body) { try { $r = & $__body; Write-Host "PASS $name" -ForegroundColor Green; return $r } catch { Write-Host "FAIL $name : $($_.Exception.Message) $($_.ErrorDetails.Message)" -ForegroundColor Red; $script:failed++ } }
$script:failed = 0

$cities = Step "cities" { (Invoke-RestMethod "$Base/redbus/cities" -Headers $h).cities }
$trip = $null; $doj = $null
:outer foreach ($c in $cities) {
  $dests = Invoke-RestMethod "$Base/redbus/destinationBySource?source=$($c.id)" -Headers $h
  foreach ($d in @($dests.cities ?? $dests)) {
    foreach ($off in 1..10) {
      $day = (Get-Date).AddDays($off).ToString("yyyy-MM-dd")
      $s = (Invoke-WebRequest "$Base/redbus/search?source=$($c.id)&destination=$($d.id)&doj=$day" -Headers $h).Content | ConvertFrom-Json -AsHashtable
      $t = $s.availableTrips | Where-Object { $_.bookable -and $_.availableSeats -ge 2 } | Select-Object -First 1
      if ($t) { $trip = $t; $doj = $day; break outer }
    }
  }
}
if (-not $trip) { Write-Host "FAIL search: no bookable trip found" -ForegroundColor Red; exit 1 }
Write-Host "PASS search -> inventory $($trip.id) $($trip.source)->$($trip.destination) $doj"

$layout = Step "seatlayout" { (Invoke-WebRequest "$Base/redbus/seatlayout?id=$($trip.id)&doj=$doj" -Headers $h).Content | ConvertFrom-Json -AsHashtable }
$free = $layout.seats | Where-Object { $_.available -and -not $_.ladiesSeat -and -not $_.malesSeat } | Select-Object -First 2
$pax = @(); $i = 0
foreach ($s in $free) { $i++; $pax += @{ seatName = $s.name; fare = $s.fare; ladiesSeat = $false; passenger = @{ name = "Smoke Pax $i"; mobile = "9000000000"; title = "Mr"; email = "smoke@example.test"; age = 30; gender = "MALE"; address = "Test"; idType = "PAN"; idNumber = "ABCDE1234F"; primary = ($i -eq 1) } } }
$block = @{ Inventoryid = $trip.id; boardingPointId = $trip.boardingTimes[0].bpId; droppingPointId = $trip.droppingTimes[-1].bpId; source = $trip.source; destination = $trip.destination; inventoryItems = $pax } | ConvertTo-Json -Depth 6
$b = Step "blockticket" { Invoke-RestMethod "$Base/redbus/blockticket" -Method Post -Body $block -ContentType application/json -Headers $h }
Step "blockticket same seats -> SEAT_UNAVAILABLE" { $r = Invoke-WebRequest "$Base/redbus/blockticket" -Method Post -Body $block -ContentType application/json -Headers $h -SkipHttpErrorCheck; if ($r.StatusCode -lt 400) { throw "expected conflict, got $($r.StatusCode)" } } | Out-Null
Step "checkpnr before confirm -> 404 NOT_BOOKED" { $r = Invoke-WebRequest "$Base/redbus/checkpnr?blockkey=$($b.blockKey)" -Headers $h -SkipHttpErrorCheck; if ($r.StatusCode -ne 404 -or $r.Content -notmatch 'NOT_BOOKED') { throw "got $($r.StatusCode) $($r.Content)" } } | Out-Null
$confirmBody = @{ Blockkey = $b.blockKey; Fare = [decimal]$b.totalFare } | ConvertTo-Json
$cf = Step "confirmticket" { Invoke-RestMethod "$Base/redbus/confirmticket" -Method Post -Body $confirmBody -ContentType application/json -Headers $h }
$cf2 = Step "confirmticket idempotent" { $r = Invoke-RestMethod "$Base/redbus/confirmticket" -Method Post -Body $confirmBody -ContentType application/json -Headers $h; if ($r.pnr -ne $cf.pnr) { throw "different PNR $($r.pnr)" }; $r }
Step "checkpnr" { $r = Invoke-RestMethod "$Base/redbus/checkpnr?blockkey=$($b.blockKey)" -Headers $h; if ($r.pnr -ne $cf.pnr) { throw "mismatch" } } | Out-Null
Step "ticket" { Invoke-RestMethod "$Base/redbus/ticket?pnr=$($cf.pnr)" -Headers $h } | Out-Null
Step "updateticket" { Invoke-RestMethod "$Base/redbus/updateticket" -Method Post -ContentType application/json -Headers $h -Body (@{ pnr = $cf.pnr; mobile_number = "9111111111" } | ConvertTo-Json) } | Out-Null
Step "tripstatus" { Invoke-RestMethod "$Base/redbus/tripstatus" -Method Post -ContentType application/json -Headers $h -Body (@{ pnr = $cf.pnr; Operator_id = "x" } | ConvertTo-Json) } | Out-Null
Step "cancelticket partial" { Invoke-RestMethod "$Base/redbus/cancelticket" -Method Post -ContentType application/json -Headers $h -Body (@{ pnr = $cf.pnr; seatsToCancel = @($pax[1].seatName); notes = "smoke" } | ConvertTo-Json) } | Out-Null
Step "cancelticket remaining" { Invoke-RestMethod "$Base/redbus/cancelticket" -Method Post -ContentType application/json -Headers $h -Body (@{ pnr = $cf.pnr; seatsToCancel = @($pax[0].seatName); notes = "smoke" } | ConvertTo-Json) } | Out-Null
Step "tentativerelease disabled -> 501" { $r = Invoke-WebRequest "$Base/redbus/tentativerelease?blockKey=x" -Headers $h -SkipHttpErrorCheck; if ($r.StatusCode -ne 501) { throw "got $($r.StatusCode)" } } | Out-Null
Step "admin status" { Invoke-RestMethod "$Base/api/admin/integrations/redbus/status" -Headers $adm } | Out-Null
Step "admin outbox" { $o = Invoke-RestMethod "$Base/api/admin/integrations/redbus/outbox" -Headers $adm; Write-Host ("  outbox: " + ($o | ConvertTo-Json -Compress -Depth 2).Substring(0, 200)) } | Out-Null
Step "admin without key -> 401" { $r = Invoke-WebRequest "$Base/api/admin/integrations/redbus/status" -SkipHttpErrorCheck; if ($r.StatusCode -ne 401) { throw "got $($r.StatusCode)" } } | Out-Null
if ($script:failed) { Write-Host "$($script:failed) step(s) failed" -ForegroundColor Red; exit 1 } else { Write-Host "ALL PASSED" -ForegroundColor Green }
