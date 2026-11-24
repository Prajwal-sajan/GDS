# JourneyOS GDS — complete migration execution contract

**Owner request:** Finish the entire original GDS migration end to end; do not require new approval for every small screen/control improvement. This is the completion contract for the **same ongoing migration**, not a claim that the migration is finished.

## Baseline and single destination

- **Legacy functional and visual baseline:** `savetrip-screenshotcomplete`, the Node/Express `public/` + `server/` application, screenshot batches, audit reports and `SCREENSHOT_FEATURE_RECONCILIATION.csv` (145 features, as of 2026-11-21).
- **Destination:** native React/TypeScript frontend + ASP.NET Core/.NET backend + PostgreSQL authoritative database + Redis disposable cache. Do not replace the React app with embedded old DOM, mock tables, or a hidden legacy iframe.
- **Delivery lineage:** v1 seat layout; v2 Routes/navigation; v3 P&L/Share; v4 Tickets and Daily Operations. Carry forward earlier validated commits. Feature branches are integration checkpoints, **not** declarations of overall completion.
- **Definitive evidence:** `docs/modernization/UI_PARITY_MASTER_MATRIX.md`, `docs/modernization/API_PARITY_MATRIX.md`, `modern/release-readiness.json`, Playwright tests, PostgreSQL API tests, and visual screenshot comparison outputs. Reconcile them against the real repository periodically; the matrices themselves can lag code changes.

## End-to-end deliverable set (each is a mandatory part of the one migration)

| Area | Required full-migration behavior | Present evidence to establish acceptance |
| --- | --- | --- |
| Global navigation & login | Top-level Trips/GDS/Chats/Calls; eight GDS submenus; language/settings, alerts, search, roles, branches, theme, user switching and mobile states; original keyboard/selection/dialog behavior | All source screenshots, four role profiles, keyboard and accessibility browser tests |
| Routes | CRUD/clone, route versions, cities, stops, pickup/drop stages, calendars, recurrence, restrictions, booking policies, fares, cancellation rules, vehicle alternation, validity/locking | Legacy-vs-React screenshots for every dialog; PostgreSQL invariants, schedule generation tests |
| Schedules | List, dates, filters, PNR charts, seat maps, 2+1/2+2 layouts, blocks/unblocks, Update, Cities/Pickups/Drops, Fares, History, P&L, Share, copy image, print/export | Signed scenario matrix with live two-desk seat interactions, tenant and branch tests, pixel comparisons |
| Ticket lifecycle | Counter/agent/branch sale, passenger entry, hold/confirm, payment, PNR search, status, boarding, ticket printing/PDF, notifications, seat/date shift, partial/full cancellation, refund quote and independent payout reconciliation | Atomic concurrency and fare-policy tests; every ticket dialog and PDF fixture; payment gateway sandbox evidence |
| Coach editor | Coach type, 2+1/2+2 geometry, deck, seat numbering/types, movable seats, exits, toilet, aisle, amenities, per-route usage, delete/version guards and live preview | Pixel layouts and physical-geometric validation; capacity and collision invariants |
| Fleet & Vehicles | Cards/list, filters, model/coach mapping, vehicle profiles and compliance, repairs, documents, GPS/ECU integration if authorized, map/alerts when actual evidence exists | Vehicle edit CRUD/security/expiry tests, provider proof for every *live* indicator |
| Staff | Personal Info, Payables, Bank Details, Ledger, Documents; drivers/helpers, training/licence, assignment, attendance, wages/advance/payout, masks and access controls | Field-level permissions, payslip/export fixtures, document antivirus/size/type and audit tests |
| CRM | Customer 360, PNR/phone/email searches, ticket history, fares, notes, loyalty, ratings, communications, outbound actions with delivery truth | Privacy-role/cross-tenant and link-to-booking tests, screenshot popups |
| Accounts & invoices | Sales, receivables, transactions, ledgers, OTA commission, settlement, agents, report suite, PDF invoices issued by GDS, CSV/XLSX/PDF exports, payment proofs | Ledger conservation and cancel/shift reversal tests; exact field/PDF/Excel comparisons |
| OTA invoice verifier | RedBus original PDF ingestion, per-PNR reconciliation, mismatch reasons, approve/dispute audits, final CSV/Excel matching supplied headers | Real sample statement acceptance, duplicate and corrupt-file defense, decimal reconciliation |
| Daily Ops | Per-service dispatch/pickup/drop/check-in/safety console, fleet, seat trends, channels, passenger actions, no-shows, operational audits, OTA ratings, score history | Historical source provenance and screenshot parity, both live and no-data UI states |
| Reports | Every original report, date/route/branch/channel filter, totals, sorting, pagination, empty state, export and print | Independent reproduction against original PDF/CSV and ledger source data |
| Settings & access | Configuration, organization profile, branding, notification templates, city/seat rules, role matrix Off/Own/Branch/Company, safe switch-user, account security | Server-side IAM/branch scopes, role UAT and screenshot comparison, no seeded secrets |
| Chats & Calls | Inbox filters, templates, PNR references, call history, statuses and broadcasts only with valid provider permissions | Provider ack/read receipts; no simulated "call connected" or WhatsApp delivered claim |
| Sarathi | Grounded scoped reporting, real report source references, conversational history and roles | Queries validated against actual reports and tenant-PII boundaries |
| RedBus / Integrations | Provider contract coverage, inbound and outbound APIs, outbox/retry/idempotency, authentication, reconciliation, failure simulations | **Real authorized sandbox** contract acceptance; mocked calls do not qualify |
| Platform | Migrations and rollback, auth, data import conservation, performance, security, observability, AWS, backups, disaster recovery, runbooks | Independent staging and operator UAT; rollback drill; explicit release manager approval |

### The required acceptance pattern for **every** screen, component and operation

1. **Inventory the source fully:** source file, screenshot reference, menu path, control labels, icons/SVG, default and non-default states, permissions, errors, dialog flows, associated legacy endpoint and data model.
2. **Implement complete behavior:** frontend state management, server authority, validations, persistence, audit, filters, export/print and idempotency. Never pass a visual-only control off as functional.
3. **Check integration:** real PostgreSQL fixture, Redis-cache-degradation, multi-user concurrent access, tenant/branch/role boundaries, numeric accounting invariants, OTA/payment provider ownership and failure injection. Fail closed where contracts or credentials are missing.
4. **Check visual parity:** capture the same original and migrated screen with identical account, viewport, locale, fixture and state; record comparison diffs and manually accept text, SVG, pixels, responsive behavior, modal/dropdown overlays and typography.
5. **Mark done only with evidence:** update parity register/API matrix, capture test-run references and screenshots, update release readiness. Do not mark `verified` on successful static tests or mocked API tests alone.

## Rules for uninterrupted implementation

- Work continuously against the **whole backlog** without requesting the user's approval after each control or dialog. Batch coherent feature changes and verify each batch in CI, then proceed to the next missing module. Draft PRs can preserve work without declaring the project complete.
- Where UI is ready but live provider integration is pending, show a truthful disabled/not-connected state; never generate fake provider messages or billing evidence. Keep sensitive customer/competitor screenshots out of synthetic test fixtures.
- Prefer existing production-grade .NET services and the real PostgreSQL model. Avoid parallel sources of truth in Node, mocked React state, or browser localStorage for business records.
- When resolving conflict between screenshot look and safety, preserve the look where possible while protecting tenant, financial and authentication integrity.
- Keep legacy Node available in parallel until all gates pass; no production cutover, refund payout, fare publication or OTA outbound enablement without the operator/provider safety gates.
- **Latest status (v4):** the new ticket and Daily Ops native screens **do not yet** establish screenshot parity or production readiness. `releaseAllowed` must remain `false`.

## Release acceptance (single terminal objective)

Migration is complete only when **all** 145+ legacy screenshot features and **all** legacy UI workflows are accounted for, all still-relevant legacy API contracts are migrated/equivalently implemented or explicitly retired with evidence, all module-level visual and functional tests are independently verified, the real provider and payment gateways have been accepted, and the production environment has passed data reconciliation, security, performance, restore and rollback drills. The count is a baseline; newly discovered dialogs/options become tracked requirements.

Do not equate a draft branch, a green CI badge, or a subset of screens with the terminal objective.
