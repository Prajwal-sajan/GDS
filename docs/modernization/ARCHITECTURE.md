# JourneyOS modern platform — architecture, state machines, cache design

## Topology

```
RedBus ──HTTPS──▶ /redbus/*  ┐
Operators (React SPA) ─────▶ /api/admin/* ├─ ASP.NET Core 10 (JourneyOS.Api) ──▶ PostgreSQL 17 (authoritative)
                             ┘          │  ├─ OutboxDispatcher (BackgroundService) ──HTTPS──▶ RedBus callbacks
                                        │  └─ HoldExpirySweeper (BackgroundService)
                                        └──▶ Redis 7 (cache only, allkeys-lru, no persistence)
Legacy Node app (server/, public/) keeps running for every route not yet migrated (see API_PARITY_MATRIX.md).
```

Principles:
* **PostgreSQL is the only source of truth.** Redis contents may be lost at any time; every read path falls back to PostgreSQL (`RedisGdsCache` turns every Redis error into a miss). Verified by `Redis_outage_degrades_to_postgres_without_errors`.
* **No double sale.** `seat_allocations` has `EXCLUDE USING gist (trip_id WITH =, coach_seat_id WITH =, segment WITH &&) WHERE (is_active)`; segment = `int4range(from_seq, to_seq)`. Application checks run under a `SELECT … FOR UPDATE` trip lock; the constraint is the final guard (SQLSTATE 23P01 → `SEAT_UNAVAILABLE`).
* **Side effects are transactional.** Callbacks are written to `outbox_messages` in the same transaction as the booking change; cache generations are bumped only after commit.
* **Tenant isolation.** Every tenant-owned entity has an EF global filter `tenant_id = current`; raw SQL always includes `tenant_id`.
* **Audit.** `audit_logs` is append-only (UPDATE/DELETE blocked by trigger).

## Seat hold / booking state machine

```
            blockticket                     confirmticket (fare ==)
   (free) ──────────────▶ HOLD [Held] ───────────────────────────▶ BOOKING [CONFIRMED]
                           │  │                                        │      │
     expires_at passed ────┘  └── tentativerelease (A-01)              │      └─ cancelticket (some seats) ─▶ PARTIALLY_CANCELLED ─▶ … ─▶ CANCELLED
     (sweeper / lazy)            ▼                                     │
                         [Expired] / [Released]                         └─ bus cancellation (operator) ─▶ CANCELLED (0 % charge) + MANUAL_BUS_CANCELLATION
                         allocations is_active=false                    └─ shift (operator) ─▶ CONFIRMED on new trip + SHIFT
```

* `seat_holds.status`: Held → Confirmed | Expired | Released. Confirm on Confirmed is idempotent (same PNR) if fare matches.
* `seat_allocations.kind`: Hold → Booked (same row, at confirm), Blocked (operator quota). Release = `is_active=false` with `reason`.
* Passenger boarding status: Yet-To-Board → Boarded | No-Show (admin endpoint; exposed through `/redbus/tripstatus`).

## Outbox state machine

```
Pending(1) ──lease──▶ Delivering(2) ──ack──▶ Acknowledged(3)
   ▲                       │ retryable (5xx/408/429/connect) → Pending with backoff 15 s·2^(n-1) ≤ 1 h; > MaxAttempts → Failed(4)
   │                       │ 4xx → Failed(4)
   │                       │ ambiguous on MANUAL_BUS_CANCELLATION / SHIFT → Blocked(5)  (manual reconcile)
   └── admin retry ◀───────┘ Failed / Blocked
Pending duplicate with same (provider, dedup_key) → insert is a no-op (coalesced); on retry conflict → Superseded(6)
```
Leases use `FOR UPDATE SKIP LOCKED`, so several API instances can run the dispatcher safely. Expired leases (`Delivering` past `next_attempt_at`) are reclaimed.

## Redis key design

| Key | Value | TTL | Invalidated by |
|---|---|---|---|
| `t:{tenant}:gen:catalog` | generation counter | none | import / master-data changes |
| `t:{tenant}:gen:search` | generation counter | none | any hold/confirm/cancel/shift/bus cancel |
| `t:{tenant}:gen:trip:{tripId}` | generation counter | none | any seat change on that trip |
| `t:{tenant}:cities:g{gen}` | cities JSON | 10 min | catalog gen |
| `t:{tenant}:dests:{src}:g{gen}` | destinations JSON | 10 min | catalog gen |
| `t:{tenant}:search:{src}:{dst}:{doj}:g{gen}` | search JSON | 30 s | search gen |
| `t:{tenant}:seatlayout:{inventoryId}:{doj}:g{gen}` | layout JSON | 10 s | trip gen |

Invalidation = `INCR` the generation; old keys simply age out (no `KEYS`/`SCAN` deletes). Per-key single-flight inside each process prevents stampedes. Holds, bookings, idempotency and expiry **never** live in Redis.

## Configuration reference

| Key | Default | Purpose |
|---|---|---|
| `ConnectionStrings:Postgres` | — (required) | authoritative store |
| `ConnectionStrings:Redis` | empty = no cache | cache |
| `Database:MigrateOnStartup` | false | apply EF migrations at boot (dev only) |
| `Inventory:HoldMinutes` | 10 | block-key lifetime |
| `RedBus:TenantCode` | — | tenant served by inbound `/redbus/*` |
| `RedBus:PathPrefix` | `/redbus` | inbound mount |
| `RedBus:InboundSecret` / `InboundSecretHeader` | — / `X-GDS-Key` | inbound auth (A-02) |
| `RedBus:AllowedIps` | [] | optional allow-list |
| `RedBus:EnableTentativeRelease` | false | A-01 |
| `RedBus:RatePerMinute` | 600 | per-IP fixed window |
| `Outbox:*` | see `OutboxOptions` | batch, attempts, lease, poll, timeout, `AllowInsecureCallbacks` (mock only) |
| `Workers:Enabled` | true | run dispatcher + sweeper in this process |
| `Admin:Keys[]` | — | interim admin service keys (SHA-256 only) |
