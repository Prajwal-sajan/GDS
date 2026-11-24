# Runbook — JourneyOS modern GDS

## Local development

```pwsh
cd modern
docker compose up -d postgres redis              # PG on 5433, Redis on 6380
cd backend
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --project src/JourneyOS.Api -- import-legacy ../../data/db.json demo 2026-11-24 DEMOTRV   # idempotent
pwsh ../scripts/restart-api.ps1                   # API on http://localhost:5080 (logs: modern/api.log)
pwsh ../scripts/redbus-smoke.ps1                  # end-to-end RedBus flow
pwsh ../scripts/ops-smoke.ps1                     # crew replacement, seat block, counter booking, reconciliation
dotnet test tests/JourneyOS.Tests                 # Testcontainers (needs Docker)
cd ../frontend; npm install; npm run dev          # SPA on http://localhost:5173 (proxies /api, /redbus, /hubs)
npx playwright test                               # e2e against the running API + dev server
```
Dev admin key: `dev-owner-key` (only its SHA-256 is in `appsettings.Development.json`). Never reuse in other environments.

## Deploy checklist (non-dev)
1. Provide secrets via environment / secret store, never appsettings: `ConnectionStrings__Postgres`, `ConnectionStrings__Redis`, `RedBus__InboundSecret`, `Admin__Keys__0__KeySha256`, …
2. Run migrations explicitly: `JourneyOS.Api migrate` (keep `Database:MigrateOnStartup=false`).
3. Keep `OutboundEnabled=false` for the REDBUS provider until RedBus confirms the callback URL and the ambiguity register items needed for go-live are closed.
4. Set `RedBus:AllowedIps` to RedBus egress ranges once provided.
5. Health: `/health/live` (process), `/health/ready` (PG must be up; `degraded=true` means Redis down — service still correct).

## Incidents

**Redis down** — `/health/ready` shows `redis:false, degraded:true`. No action needed for correctness; expect higher PG load. Restart Redis; no warm-up or flush needed (generation keys restart from scratch, stale entries cannot be served because generations are re-read).

**PostgreSQL down** — inbound calls return 503 `STORE_UNAVAILABLE`; no partial commits are possible. Outbox and sweeper pause and resume automatically.

**Outbox message `Blocked`** (MANUAL_BUS_CANCELLATION / SHIFT with ambiguous result):
1. `GET /api/admin/integrations/redbus/outbox?status=Blocked` and `/outbox/{id}/attempts` to read the response.
2. Confirm with RedBus support whether the event was processed.
3. If **not** processed: `POST /outbox/{id}/retry`. If processed: leave Blocked and record the RedBus reference in the ticket; never retry (would double-refund/shift).

**Outbox `Failed`** — 4xx or retries exhausted. Fix the cause (URL, payload), then retry. A retry that conflicts with a newer pending message returns 409; the newer message already carries the latest state.

**Suspected double allocation** — impossible while the exclusion constraint exists. Verify: `\d seat_allocations` shows `ex_seat_allocations_no_overlap`. Never drop it to "fix" an import.

**Stuck holds** — `HoldExpirySweeper` runs every 30 s; reads also expire lazily per trip. Inspect: `SELECT status, count(*) FROM seat_holds GROUP BY 1;`.

**Realtime not updating** — the Dispatch badge shows `offline`/`reconnecting`. Data is still correct (refresh reloads from the API). SignalR is in-process; with more than one API node, add the Redis backplane before relying on live updates.

**Reconciliation shows everything `needs_review`** — expected for bookings without captured OTA commission/take-home evidence (all legacy-imported rows). Do not back-fill estimates; record evidence from RedBus settlement data and run *Recheck*.

**Reconciliation upload rejected** — `DUPLICATE_INVOICE` (same number, different content): confirm which file is authoritative with accounts before deleting anything. `OPERATOR_MISMATCH`: statement belongs to another operator code.

**Rollback** — the legacy Node app remains authoritative for every route not marked migrated. Disabling the modern RedBus channel = remove inbound routing at the edge and set provider `OutboundEnabled=false`. Database migration rollback: `dotnet dotnet-ef database update 0` (dev only; destroys data).
