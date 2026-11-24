# Legacy feature inventory & migration status

Baseline: branch `savetrip-screenshotcomplete` @ `7da45d5` (Node/Express + `data/db.json`, vanilla JS SPA in `public/`).
Route counts come from `server/api/*.js` route declarations (324 total). Per-route detail: `API_PARITY_MATRIX.md`.

Status legend: **Modern** = implemented in .NET/PostgreSQL with tests · **Partial** = core implemented, gaps listed · **Legacy** = served only by Node (must stay on).

| Area | Legacy modules (routes) | Modern status | Notes / gaps |
|---|---|---|---|
| Seat inventory, holds, bookings (OTA channel) | ops.js (37, part) | **Modern (RedBus channel)** | Segment-aware allocation with DB exclusion constraint; holds with expiry; idempotent confirm. Counter/agent booking UI still legacy |
| RedBus OTA inbound API | — (new) | **Modern** | 11 documented operations; `tentativerelease` gated (A-01) |
| RedBus callbacks | schedule-update-v51.js `sync-ota` (partial) | **Modern (disabled by default)** | Outbox + dispatcher; mock-verified only |
| Cancellation & refunds | ops.js `/bookings/:pnr/cancel`, refund-quote | **Partial** | Slab policy + refunds recorded; refund-quote endpoint & payment-gateway refunds not ported |
| Bus cancellation | ops.js `/trips/:sid/cancel` | **Partial** | 0 % charge, REMOVE_SERVICE + MANUAL_BUS_CANCELLATION; SMS/WhatsApp fan-out not ported |
| Bus / passenger shift | ops.js `/bookings/:pnr/shift*` | **Partial** | Whole-PNR shift + SHIFT callback; shift-options & fare difference not ported |
| Boarding status / trip status | ops.js trips, pickup-chart-v40.js (7) | **Partial** | Boarding status API + RedBus tripstatus; pickup chart UI legacy |
| Masters: cities, coaches, routes, stops, stages, fares, refund slabs | master.js (61, part) | **Partial (import only)** | Imported idempotently from db.json; CRUD UI/API still legacy |
| Vehicles, staff, attendance, advances, documents, payouts | master.js, vehicle-details-v19.js (11), fleet-operations-v20.js (3) | Legacy | |
| Schedules management / insights / share | schedule-*.js, pnl-v18.js | Legacy | |
| Accounts, invoices, coupons, P&L, reports | accounts.js (23), invoices-v24.js (10), report-*.js (7), platform-billing-v25.js (11) | Legacy | OTA invoice reconciliation needs RedBus settlement format (not in sample doc) |
| OTA reconciliation & ratings | ota-reconciliation-v43.js (9), ota-ratings-settings-v44.js (3) | Legacy | |
| CRM, chats, calls, notifications, WhatsApp, communications | misc.js (44, part), whatsapp-v33.js (5), communication-history-v35.js | Legacy | |
| Loyalty & upgrades | loyalty-v34.js, loyalty-upgrades-v39.js | Legacy | |
| Settings, configuration, branding | settings-complete.js (20), configuration-v30.js (12), branding-public-v17.js | Legacy | |
| Auth, IAM, team access, switch user | misc.js auth/iam, settings-v16-iam-bridge.js, team-access-v26/28.js (26), switch-user-v34.js | Legacy | Modern admin API uses interim hashed service keys + role policies; OTP login/IAM not ported |
| Integration admin UI | — (new) | **Modern** | React SPA: RedBus status, outbox, attempts, retry, config, trips & bus cancel |

## Data migrated by `import-legacy`
Tenant, REDBUS provider (outbound disabled), cities, coach templates & seats, routes, stops, pickup/drop stages (break stages skipped — no city), segment fares, refund slabs, seat fare rules, trips from a given date, operator seat blocks, confirmed bookings + passengers + seat allocations. Not migrated: payments, accounts, staff, vehicles, CRM, communications, settings.
