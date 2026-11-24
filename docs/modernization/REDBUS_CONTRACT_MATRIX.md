# RedBus contract matrix & ambiguity register

Source of truth: `Sample Integration Docs (1).docx` (text extract: `docs/redbus/sample-integration-docs.txt`).
Implementation: `modern/backend/src/JourneyOS.Api/RedBus/*`, `Outbox/*`, `Inventory/*`.

> **Certification status: NOT RedBus-certified.** Every row below is verified only against the sample
> document and a local mock provider (`MockRedBusHandler` in the test suite). No call has been made to
> RedBus sandbox or production. Go-live requires the ambiguities below to be closed in writing by RedBus
> and a recorded sandbox acceptance run.

## Inbound (RedBus → GDS)

Mounted under `RedBus:PathPrefix` (default `/redbus`). Guarded by `RedBusGuardFilter` (shared secret header + optional IP allow-list; see A-02).

| # | Doc § | Method / path | Request fields (as documented) | Response fields | Implementation | Tests |
|---|---|---|---|---|---|---|
| 1 | 1 Search | GET `/search?source&destination&doj` | source, destination, doj (yyyy-MM-dd) | `availableTrips[]`: id, travels, vehicleType, busType, operator, routeId, doj, departureTime, arrivalTime, boardingTimes[], droppingTimes[], availableSeats, fares[], fareDetails[], cancellationPolicy, partialCancellationAllowed, source, destination, bookable, serviceId, maxSeatsPerTicket, avlWindowSeats, busRoutes, singleLadies, ac, AC, nonAC, seater, sleeper, primaryPaxCancellable | `RedBusQueryService.SearchAsync`; Redis 30 s, generation-invalidated | smoke, `FindTrip` in all inventory tests |
| 2 | 2 Seat Layout | GET `/seatlayout?id&doj` | id (= search `id`), doj | seats[] {name,row,column,zIndex,length,width,fare,baseFare,available,ladiesSeat,malesSeat} + trip header | `SeatLayoutAsync`; Redis 10 s per trip generation | `Cache_is_invalidated_after_booking`, segment test |
| 3 | 3 Tentative Booking | POST `/blockticket` | Inventoryid, boardingPointId, droppingPointId, source, destination, inventoryItems[] {seatName, fare, ladiesSeat, passenger{…, primary}} | blockKey, currency, totalFare (string), fareBreakupList[] {fare, baseFare, gst, passenger_type} | `InventoryService.HoldAsync` — trip row lock + GiST exclusion constraint | `Concurrent_blocks_on_same_seat_allow_exactly_one_winner` |
| 4 | 4 Confirm Booking | POST `/confirmticket` | Blockkey, Fare | pnr, status, dateOfIssue, travels, busType, refundAmount, cancellationCharges, cancellationPolicy | `ConfirmAsync` (idempotent per blockKey; fare must match) | `Confirm_is_idempotent_…`, `Confirm_rejects_fare_mismatch…`, `Expired_hold…` |
| 5 | 5 Cancel Ticket | POST `/cancelticket` | pnr, seatsToCancel[], notes | cancellationCharge, refundAmount, pnr, Dateofcancel, cancellationPolicy | `CancelAsync` (slab-based charge; partial/primary rules) | `Partial_then_full_cancellation…` |
| 6 | 6 Cities and SD | GET `/cities`, GET `/destinationBySource?source` | — / source | cities[] {id,name,countryId,countryName,locationType} | `CitiesAsync`, `DestinationsAsync` | smoke |
| 7 | 7 Ticket Details | GET `/ticket?pnr` | pnr | full ticket document (see contracts) | `TicketAsync` | partial/bus cancellation tests |
| 8 | 8 Check PNR | GET `/checkpnr?blockkey` | blockkey | as confirm; 404 `NOT_BOOKED` if never confirmed | `CheckPnrAsync` (read-only, never books) | `Confirm_is_idempotent_and_checkpnr_never_creates_bookings` |
| 9 | 9 Update Booking | POST `/updateticket` | pnr, mobile_number, boarding_at, drop_off | status, message | `UpdateAsync` (cutoff; same-city stage change only) | `Update_ticket_changes_mobile_and_rejects_segment_change` |
| 10 | 10 Trip Status | POST `/tripstatus` | pnr, Operator_id | per-seat Boarded / No-Show / Yet-To-Board | `TripStatusAsync` | smoke |
| 11 | 11 Release Seats | GET `/tentativerelease` | blockKey, seatNos[] | status, message | **Disabled (501)** until A-01 is resolved; logic exists in `ReleaseAsync` | `Tentative_release_is_disabled_until_contract_confirmed` |

## Outbound callbacks (GDS → RedBus)

Delivered only through the transactional outbox (`outbox_messages`). URL = provider `CallbackUrl` + `?action_type=…`, POST JSON.
Sending requires: provider `OutboundEnabled = true`, HTTPS URL (unless `Outbox:AllowInsecureCallbacks` for a local mock), worker enabled. Default import sets `OutboundEnabled = false`.

| # | Doc § | action_type | Trigger in GDS | Dedup key (pending rows coalesce) | Ack rule | On ambiguous result |
|---|---|---|---|---|---|---|
| 1 | Cities/SD | `NEW_CITY_VSD` | admin `/resync` | `NEW_CITY_VSD:{batch}` | body `{"status":"ok"}` | retry w/ backoff |
| 2 | Search | `SEARCH` | admin `/resync` (per S-D-DOJ) | `SEARCH:{src}:{dst}:{doj}` | `{"status":"ok"}` | retry |
| 3 | Inventory Update | `UPDATE_SERVICE` | hold, release, cancel, shift | `UPDATE_SERVICE:{inventoryId}` | `{"status":"ok"}` | retry |
| 4 | Inactive Services | `REMOVE_SERVICE` | bus cancellation | `REMOVE_SERVICE:{inventoryId}` | `{"status":"ok"}` | retry |
| 5 | Bus Cancellation | `MANUAL_BUS_CANCELLATION` | admin trip cancel (redbus bookings) | `MANUAL_BUS_CANCELLATION:{pnr}` | plain `SUCCESS` or `{"status":"ok"}` | **Blocked** — operator must reconcile before retry (avoids double refund) |
| 6 | Bus Shift | `SHIFT` | admin booking shift | `SHIFT:{pnr}:{newTripId}` | `{"status":"ok"}` | **Blocked** |

Non-2xx 408/429/5xx and connection failures → retry (exponential, max `Outbox:MaxAttempts`). Other 4xx → `Failed`. 2xx without the documented body → *not* success.

## Ambiguity register

Each item must be answered by RedBus in writing; the interim behaviour is deliberately conservative.

| ID | Topic | What the document says | Ambiguity | Interim behaviour | Owner / status |
|---|---|---|---|---|---|
| A-01 | Release Seats transport | `Method: GET`, URL `/tentativerelease`, followed by a JSON block labelled **"Response"** containing `blockKey`, `seatNos` and then a second "Response" | GET with body is non-standard; first block is probably the request; query-string vs body unknown | Endpoint returns 501 unless `RedBus:EnableTentativeRelease=true`; when enabled accepts JSON body *or* `?blockKey=`. Holds auto-expire after `Inventory:HoldMinutes` regardless | Open |
| A-02 | Inbound authentication | Not specified | No auth scheme, IP ranges or signing documented | Shared secret in header `RedBus:InboundSecretHeader` (default `X-GDS-Key`) + optional IP allow-list; fails closed (503) outside Development/Testing if unset | Open |
| A-03 | Callback authentication | Not specified | No credentials for `redbus-domain-name` | No auth headers sent; credentials must never be embedded in URL (status API strips everything but host) | Open |
| A-04 | Callback base URL | `http://redbus-domain-name?action_type=…` | Placeholder; scheme is http | Configured per tenant; HTTPS enforced | Open |
| A-05 | RedBus `PNR` in MANUAL_BUS_CANCELLATION / SHIFT | Sample includes `"PNR": "TS…"` (RedBus PNR) and `operator_pnr_number` | blockticket/confirmticket never send the RedBus PNR, so GDS cannot know it | `PNR` sent as `null`; GDS PNR in `operator_pnr_number` | Open — ask RedBus to add their PNR to blockticket or accept null |
| A-06 | `operator_pnr_number` in SHIFT | Not present in the SHIFT sample | Without it (and with A-05) RedBus cannot identify the ticket | GDS adds `operator_pnr_number` as an extra field | Open — confirm extra field is tolerated |
| A-07 | `ac` and `AC` | Search/layout samples contain both keys | Duplicate semantics; case-insensitive parsers collide | Both emitted with the same value; serialised case-sensitively | Open |
| A-08 | cancellationPolicy 4th field | `"0:24:100:0;…"` | Meaning of 4th field undocumented (percentage vs flat flag?) | Always `0`, interpreted as "percentage"; hours measured before boarding time | Open |
| A-09 | Field types | e.g. `mobileNo` number vs `phoneNo` string; ids as strings in callbacks, numbers inbound | Mixed types across samples | Emitted exactly as the sample types per message | Open |
| A-10 | Ticket sample JSON | Ticket Details sample is not valid JSON (trailing commas / quotes) | Exact optional fields uncertain | Fields implemented as listed; extra fields not invented | Open |
| A-11 | SHIFT `cancellationReferenceTime` | `"2025-09-29 21: 15: 00"` (spaces) | Likely typo | Emitted as `yyyy-MM-dd HH:mm:ss` | Open |
| A-12 | `doj` on multi-day routes | Not defined | Origin date vs boarding date at source | `doj` = local boarding date at the searched source city | Open |
| A-13 | Ack body | `{"status":"ok","message":"success"}`; bus cancellation `SUCCESS` | Whether other 2xx bodies mean success | Only those bodies count as acknowledged | Open |
| A-14 | Fare in confirm | `Fare` | Whether `Fare` is total incl. GST | Must equal blockticket `totalFare` (incl. GST) exactly, else 409 `FARE_MISMATCH` | Open |
| A-15 | Error format | Not specified | Error body / status codes undocumented | `{status:"FAILED", errorCode, message}` with 4xx/5xx; 503 `STORE_UNAVAILABLE` on DB outage (no partial commit) | Open |
