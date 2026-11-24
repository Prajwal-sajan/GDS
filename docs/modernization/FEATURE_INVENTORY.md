# Legacy feature inventory & migration status

Baseline: branch `savetrip-screenshotcomplete` @ `7da45d5` (Node/Express + `data/db.json`, vanilla JS SPA in `public/`).
Route counts come from `server/api/*.js` route declarations (324 total). Per-route detail: `API_PARITY_MATRIX.md`.

Status legend: **Modern** = implemented in .NET/PostgreSQL with tests · **Partial** = core implemented, gaps listed · **Legacy** = served only by Node (must stay on).

| Area | Legacy modules (routes) | Modern status | Notes / gaps |
|---|---|---|---|
| Seat inventory, holds, bookings | ops.js (37, part) | **Modern (RedBus + counter/agent)** | Segment-aware allocation with DB exclusion constraint; holds with expiry; idempotent confirm. Counter/agent booking (`POST /api/admin/bookings/counter`) reuses the same hold→confirm path and records `payments` (cash/card/upi = PAID, agent_credit/RedBus = RECEIVABLE). Offers, miles, notifications not ported |
| Seat blocks / quotas | ops.js `/schedules/:id/blocks` | **Partial** | Block/release with exclusion constraint + UPDATE_SERVICE callback + cache invalidation + realtime event; Dispatch seat map UI |
| Trip crew & vehicle (bus change, driver replacement) | schedule-update-v51.js `assignment` | **Partial** | Active assignment per role (partial unique index), replacement history + reason, same-day conflict, licence expiry, same-coach-layout rule for bus change; SMS to crew not ported |
| Fares | ops.js `/schedules/:id/fares` | **Partial** | Route-level segment fare matrix editing; open holds keep quoted fare; per-schedule override & auto-pricing not ported |
| Realtime | — (polling in legacy) | **Modern** | SignalR `/hubs/ops`, tenant-scoped groups from the authenticated principal; events are refetch hints only (API stays authoritative). Single-node; Redis backplane needed for scale-out |
| RedBus OTA inbound API | — (new) | **Modern** | 11 documented operations; `tentativerelease` gated (A-01) |
| RedBus callbacks | schedule-update-v51.js `sync-ota` (partial) | **Modern (disabled by default)** | Outbox + dispatcher; mock-verified only |
| Cancellation & refunds | ops.js `/bookings/:pnr/cancel`, refund-quote | **Partial** | Slab policy + refunds recorded; refund-quote endpoint & payment-gateway refunds not ported |
| Bus cancellation | ops.js `/trips/:sid/cancel` | **Partial** | 0 % charge, REMOVE_SERVICE + MANUAL_BUS_CANCELLATION; SMS/WhatsApp fan-out not ported |
| Bus / passenger shift | ops.js `/bookings/:pnr/shift*` | **Partial** | Whole-PNR shift + SHIFT callback; shift-options & fare difference not ported |
| Boarding status / trip status | ops.js trips, pickup-chart-v40.js (7) | **Partial** | Boarding status API + RedBus tripstatus; pickup chart UI legacy |
| Masters: cities, coaches, routes, stops, stages, fares, refund slabs | master.js (61, part) | **Partial (v5 coach authoring, v2 routes, imported cities)** | Coaches: React create/edit/clone/delete, amenities, physical fixtures and locked in-use versions; routes modern authoring; remaining reference UI paths still outstanding |
| Vehicles, staff | master.js (part) | **Partial** | CRUD for vehicles (unique registration, compliance expiries) and staff (phone/licence validation, activate/deactivate); Fleet & Staff UI. GPS/DMS, documents, Aadhaar/PAN/bank not ported |
| Attendance, advances, documents, payouts | master.js, vehicle-details-v19.js (11), fleet-operations-v20.js (3) | Legacy | |
| Schedules management / insights / share | schedule-*.js, pnl-v18.js | Legacy | |
| Accounts, invoices, coupons, P&L, reports | accounts.js (23), invoices-v24.js (10), report-*.js (7), platform-billing-v25.js (11) | Legacy | Payments + per-booking OTA finance evidence now captured in modern store |
| RedBus invoice reconciliation | ota-reconciliation-v43.js (9) | **Partial** | Port of `compareInvoice`: sold / pax_cancelled / bus_cancelled / exceptional_refund + missing_in_ota; status, channel, DOJ, fare, commission, commission tax, offer, payout and cancellation-charge checks within tolerance; rows lacking GDS settlement evidence → `needs_review` (never auto-matched); SHA-256 + invoice-number dedupe; resolve (dispute needs reason) + audit; CSV export identical headers/escaping. **Gap:** PDF payment-advice text parser not ported — ingestion is normalised CSV. Real RedBus statement format unverified |
| OTA ratings | ota-ratings-settings-v44.js (3) | Legacy | |
| CRM, chats, calls, notifications, WhatsApp, communications | misc.js (44, part), whatsapp-v33.js (5), communication-history-v35.js | Legacy | |
| Loyalty & upgrades | loyalty-v34.js, loyalty-upgrades-v39.js | Legacy | |
| Settings, configuration, branding | settings-complete.js (20), configuration-v30.js (12), branding-public-v17.js | **Partial (v5 Website & City Mapping)** | Owner/admin React Settings, PostgreSQL HTTPS booking site and external city-ID mappings, Share integration; remaining branding, organization, configuration and role matrix legacy |
| Auth, IAM, team access, switch user | misc.js auth/iam, settings-v16-iam-bridge.js, team-access-v26/28.js (26), switch-user-v34.js | Legacy | Modern admin API uses interim hashed service keys + role policies; OTP login/IAM not ported |
| Operator admin UI | — (new) | **Modern (subset)** | React SPA: RedBus status/outbox/config, Trips & bus cancel, Dispatch (crew/vehicle, seat map block/release, counter booking, live updates), Fleet, Staff, Fares, Reconciliation |

## Data migrated by `import-legacy`
Tenant, REDBUS provider (outbound disabled), cities, coach templates & seats, routes, stops, pickup/drop stages (break stages skipped — no city), segment fares, refund slabs, seat fare rules, trips from a given date, operator seat blocks, vehicles, staff, trip vehicle + crew assignments, bookings (confirmed and cancelled) + passengers + seat allocations (confirmed only), one payment per booking (method/status from legacy), booking finance evidence from legacy fare fields (OTA commission left null when absent — never guessed). Not migrated: accounts ledger, settlements/invoices, CRM, communications, settings.

## Verification levels (current)
| Capability | Implemented | Functionally verified | Provider-integration verified | Production ready |
|---|---|---|---|---|
| RedBus inbound API | yes | yes (xUnit + smoke) | no (no sandbox run) | no |
| RedBus callbacks | yes | yes (mock provider) | no | no |
| Operations (crew, blocks, fares, counter booking) | yes | yes (xUnit + ops-smoke + Playwright) | n/a | no |
| Invoice reconciliation | yes (CSV) | yes (xUnit + ops-smoke + Playwright) | no (no real RedBus statement) | no |
