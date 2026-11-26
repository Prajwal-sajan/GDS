param([string]$Base = 'http://localhost:5080/api/admin', [string]$Key = 'dev-owner-key')
# Operations / finance / reconciliation smoke against a running dev API. Uses imported legacy demo data only.
$ErrorActionPreference = 'Stop'
$h = @{ 'X-Admin-Key' = $Key }
$fail = 0
function Step($name, [scriptblock]$sb) {
    try { $r = & $sb; Write-Host "PASS $name $r" } catch { $script:fail++; Write-Host "FAIL $name : $($_.ErrorDetails.Message) $($_.Exception.Message)" }
}
function J($o) { $o | ConvertTo-Json -Depth 6 -Compress }
function G($path) { $r = Invoke-RestMethod "$Base$path" -Headers $h; return $r }
function P($method, $path, $body) { Invoke-RestMethod -Method $method "$Base$path" -Headers $h -ContentType application/json -Body (J $body) }

$date = (Get-Date).AddDays(2).ToString('yyyy-MM-dd')
$trips = Invoke-RestMethod "$Base/trips?date=$date" -Headers $h
if (-not $trips) { throw "No trips on $date" }
$t = $trips[0]
Write-Host "trip $($t.id) $($t.service) $date"

Step 'list vehicles' { $v = G '/vehicles'; $v.Count }
Step 'list staff' { $s = G '/staff'; $s.Count }
Step 'assignments' { $a = G "/trips/$($t.id)/assignments"; ($a | Where-Object isActive | ForEach-Object role) -join ',' }
Step 'driver replacement' {
    $a = G "/trips/$($t.id)/assignments"
    $active = $a | Where-Object { $_.isActive -and $_.role -eq 'Driver' } | Select-Object -First 1
    $busy = $a | Where-Object isActive | ForEach-Object staffId
    $all = G '/staff'
    $phone = '9' + (Get-Random -Minimum 100000000 -Maximum 999999999)
    $cand = P Post '/staff' @{ name = "Smoke Relief $phone"; phone = $phone; role = 'driver'; status = 'active'; licenseExpiry = '2030-01-01' }
    $taken = $all | Where-Object { $_.id -in $busy } | Select-Object -First 1
    try { P Post "/trips/$($t.id)/assignments" @{ role = 'Driver'; staffId = ($busy | Where-Object { $_ -ne $active.staffId } | Select-Object -First 1); reason = 'dup' } | Out-Null; throw 'same-trip duplicate accepted' } catch { if ($_.Exception.Message -eq 'same-trip duplicate accepted') { throw } }
    $r = P Post "/trips/$($t.id)/assignments" @{ role = 'Driver'; staffId = $cand.id; reason = 'smoke replacement' }
    $after = G "/trips/$($t.id)/assignments"
    $old = $after | Where-Object { $_.staffId -eq $active.staffId -and $_.role -eq 'Driver' } | Select-Object -First 1
    if ($old.isActive) { throw 'old driver still active' }
    # put the original driver back so the smoke run leaves operational data unchanged
    if ($active.staffId) { P Post "/trips/$($t.id)/assignments" @{ role = 'Driver'; staffId = $active.staffId; reason = 'smoke restore' } | Out-Null }
    "Driver $($active.staffId) -> $($r.staffId) -> restored"
}
Step 'invalid seat rejected' {
    try { P Post "/trips/$($t.id)/blocks" @{ seats = @('ZZ_INVALID'); reason = 'x' }; throw 'accepted invalid seat' }
    catch { if ($_.ErrorDetails.Message -notmatch 'INVALID_SEAT') { throw } ; 'INVALID_SEAT' }
}
Step 'block + unblock' {
    $seat = (G "/trips/$($t.id)/seats" | Where-Object { -not $_.occupied } | Select-Object -First 1).seatCode
    $b = P Post "/trips/$($t.id)/blocks" @{ seats = @($seat); reason = 'smoke VIP' }
    try { P Post "/trips/$($t.id)/blocks" @{ seats = @($seat); reason = 'again' }; throw 'double block accepted' } catch { if ($_.Exception.Message -eq 'double block accepted') { throw } }
    $u = Invoke-RestMethod -Method Delete "$Base/trips/$($t.id)/blocks/$seat" -Headers $h
    "$seat blocked=$($b.blocked -join ',') released=$($u.released)"
}
Step 'routes+fares' { $r = G '/routes'; "$($r.Count) routes" }
Step 'counter booking (cash)' {
    $routes = G '/routes'
    $route = $routes | Where-Object id -eq $t.routeId
    $bp = $route.stages | Where-Object kind -eq 'pickup' | Select-Object -First 1
    $dp = $route.stages | Where-Object kind -eq 'drop' | Select-Object -Last 1
    $seats = G "/trips/$($t.id)/seats"
    $seat = ($seats | Where-Object { -not $_.occupied } | Select-Object -Last 1).seatCode
    $b = P Post '/bookings/counter' @{ tripId = $t.id; boardingPointId = $bp.id; droppingPointId = $dp.id; paymentMethod = 'cash'; paymentReference = 'SMOKE-CASH'; channel = 'counter'
        passengers = @(@{ seat = $seat; name = 'Smoke Counter'; age = 30; gender = 'M'; mobile = '9876543210'; primary = $true }) }
    if ($b.status -ne 'CONFIRMED' -or $b.payments[0].status -ne 'PAID' -or [decimal]$b.payments[0].amount -ne [decimal]$b.totalFare) { throw "unexpected $(J $b)" }
    $script:counterPnr = $b.pnr
    "$($b.pnr) $seat fare=$($b.totalFare) paid=$($b.payments[0].amount)"
}
Step 'reconciliation upload/compare/resolve/export' {
    $doj = $date
    $csv = "section,pnr,doj,fare,tax,commission,commission_tax,operator_offer,cancellation_charge,take_home`n" +
           "sold,$($script:counterPnr),$doj,100,5,10,1.8,0,,93.2`n" +
           "sold,NOPE$(Get-Random),$doj,500,25,50,9,0,,466`n"
    $inv = P Post '/reconciliation/invoices' @{ fileName = 'smoke.csv'; invoiceNumber = "SMOKE-$(Get-Random)"; operatorCode = 'DEMOTRV'; periodStart = $doj; periodEnd = $doj; csv = $csv }
    $tot = $inv.totals
    if ($tot.missingInGds -ne 1) { throw "expected 1 missing_in_gds: $(J $tot)" }
    $lines = G "/reconciliation/invoices/$($inv.id)/lines"
    $counter = $lines | Where-Object pnr -eq $script:counterPnr
    if ($counter.status -ne 'mismatched' -or 'channel' -notin $counter.differences) { throw "counter booking should mismatch on channel: $(J $counter)" }
    $miss = $lines | Where-Object status -eq 'unmatched_ota' | Select-Object -First 1
    try { P Post "/reconciliation/invoices/$($inv.id)/resolve" @{ lineId = $miss.id; action = 'dispute'; note = '' } | Out-Null; throw 'empty dispute accepted' } catch { if ($_.Exception.Message -eq 'empty dispute accepted') { throw } }
    P Post "/reconciliation/invoices/$($inv.id)/resolve" @{ lineId = $miss.id; action = 'dispute'; note = 'PNR unknown to GDS' } | Out-Null
    $dup = P Post '/reconciliation/invoices' @{ fileName = 'smoke.csv'; invoiceNumber = 'whatever'; periodStart = $doj; periodEnd = $doj; csv = $csv }
    if (-not $dup.duplicate) { throw 'duplicate upload not detected' }
    $csvOut = (Invoke-WebRequest "$Base/reconciliation/invoices/$($inv.id)/export" -Headers $h).Content
    if ($csvOut -is [byte[]]) { $csvOut = [Text.Encoding]::UTF8.GetString($csvOut) }
    if ($csvOut -notmatch 'Take-home Diff' -or $csvOut -notmatch 'Missing in GDS') { throw 'export missing expected columns' }
    "lines=$($tot.lines) matched=$($tot.matched) mismatched=$($tot.mismatched) review=$($tot.needsReview) missingGds=$($tot.missingInGds) missingOta=$($tot.missingInOta)"
}
Step 'reconciliation list' { (Invoke-RestMethod "$Base/reconciliation/invoices" -Headers $h).Count }
if ($fail) { Write-Host "$fail step(s) failed"; exit 1 } else { Write-Host 'ALL PASSED' }
