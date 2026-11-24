# UI parity master matrix

> **Generated** by `node modern/scripts/ui-inventory.mjs` from the captured legacy UI (`docs/modernization/qa/legacy/`), the legacy Node routes,
> the ASP.NET Core endpoints and `docs/modernization/ui-parity-status.json`. Do not edit by hand — change the status file and regenerate.

Legacy capture: 2026-11-24T08:10:39.217Z · http://localhost:3000 · 1440x900. Views: **49**, captured interaction states: **6**, inventoried elements: **3343**, legacy API endpoints: **299**, .NET endpoints: **125**.

## Totals (reproducible from this inventory)

- Views — NOT_STARTED: 49 · IMPLEMENTED_UNVERIFIED: 0 · FUNCTIONAL_PASS: 0 · VISUAL_PASS: 0 · VERIFIED_COMPLETE: 0 · BLOCKED: 0
- Shell (header/nav) — VISUAL_PASS
- Legacy endpoints — NOT_STARTED: 246 · IMPLEMENTED_UNVERIFIED: 50 · FUNCTIONAL_PASS: 3 · VISUAL_PASS: 0 · VERIFIED_COMPLETE: 0 · BLOCKED: 0

A view is only VERIFIED_COMPLETE when functional *and* visual evidence (against the legacy capture, not a React self-baseline) is recorded below.

## Shell

- Status: **VISUAL_PASS**
- Evidence: e2e/parity/shell.parity.spec.ts — header/subnav diff 0 on 4 routes; language menu 0.0001; settings menu 0.0301 (documented deviation: user/tenant line, Integrations, Sign out)

## Views

| ID | Legacy route | Elements (non-header) | States | Legacy API | Status | React | Evidence / gaps |
|---|---|---:|---:|---|---|---|---|
| V001 | `#/trips` | 113 | 3 | `GET /api/trips`<br>`GET /api/trips/:id` | NOT_STARTED | — | — |
| V002 | `#/gds/schedules` | 83 | 1 | `GET /api/schedules` | NOT_STARTED | — | — |
| V003 | `#/gds/routes` | 66 | 1 | `GET /api/routes`<br>`GET /api/cities`<br>`GET /api/coaches` | NOT_STARTED | — | — |
| V004 | `#/crm` | 14 | 0 | — | NOT_STARTED | — | — |
| V005 | `#/fleet/vehicles` | 79 | 1 | `GET /api/vehicles`<br>`GET /api/coaches` | NOT_STARTED | — | — |
| V006 | `#/fleet/coaches` | 35 | 0 | `GET /api/coaches` | NOT_STARTED | — | — |
| V007 | `#/fleet/staff` | 151 | 0 | `GET /api/staff` | NOT_STARTED | — | — |
| V008 | `#/accounts` | 32 | 0 | `GET /api/accounts/analytics`<br>`GET /api/accounts/sales-facets`<br>`GET /api/routes` | NOT_STARTED | — | — |
| V009 | `#/dailyops` | 24 | 0 | `GET /api/daily-ops`<br>`GET /api/calls`<br>`GET /api/chats`<br>`GET /api/ratings`<br>`GET /api/trips`<br>`GET /api/ota-ratings/settings`<br>`GET /api/trips/:id` | NOT_STARTED | — | — |
| V010 | `#/sarathi` | 16 | 0 | `GET /api/sarathi/conversations`<br>`GET /api/sarathi/suggestions` | NOT_STARTED | — | — |
| V011 | `#/chats` | 45 | 0 | `GET /api/chats` | NOT_STARTED | — | — |
| V012 | `#/calls` | 165 | 0 | `GET /api/calls` | NOT_STARTED | — | — |
| V013 | `#/settings` | 32 | 0 | `GET /api/iam/users`<br>`GET /api/iam/roles`<br>`GET /api/branches`<br>`GET /api/staff` | NOT_STARTED | — | — |
| V014 | `#/` | 113 | 0 | `GET /api/trips`<br>`GET /api/trips/:id` | NOT_STARTED | — | — |
| V015 | `#/gds/routes/:id` | 67 | 0 | `GET /api/routes/:id`<br>`GET /api/cities`<br>`GET /api/coaches`<br>`GET /api/vehicles`<br>`GET /api/staff` | NOT_STARTED | — | — |
| V016 | `#/fleet/attendance` | 19 | 0 | `GET /api/attendance` | NOT_STARTED | — | — |
| V017 | `#/fleet/advances` | 26 | 0 | `GET /api/advances` | NOT_STARTED | — | — |
| V018 | `#/fleet/reimbursements` | 16 | 0 | `GET /api/reimbursements` | NOT_STARTED | — | — |
| V019 | `#/fleet/payouts` | 18 | 0 | `GET /api/payouts/summary`<br>`GET /api/payouts` | NOT_STARTED | — | — |
| V020 | `#/accounts/analytics` | 32 | 0 | `GET /api/accounts/analytics`<br>`GET /api/accounts/sales-facets` | NOT_STARTED | — | — |
| V021 | `#/accounts/transactions` | 31 | 0 | `GET /api/accounts/transactions` | NOT_STARTED | — | — |
| V022 | `#/accounts/receivables` | 55 | 0 | `GET /api/accounts/receivables` | NOT_STARTED | — | — |
| V023 | `#/accounts/reports` | 30 | 0 | — | NOT_STARTED | — | — |
| V024 | `#/accounts/invoices` | 24 | 0 | `GET /api/accounts/documents`<br>`GET /api/accounts/invoices-v25` | NOT_STARTED | — | — |
| V025 | `#/accounts/reconciliation` | 16 | 0 | `GET /api/reconciliation/settlements`<br>`GET /api/reconciliation/config`<br>`GET /api/reconciliation/v43/invoices` | NOT_STARTED | — | — |
| V026 | `#/accounts/agent-settings` | 28 | 0 | `GET /api/accounts/channels`<br>`GET /api/reconciliation/config` | NOT_STARTED | — | — |
| V027 | `#/accounts/coupons` | 23 | 0 | `GET /api/coupons` | NOT_STARTED | — | — |
| V028 | `#/settings/team-access/office-staff` | 24 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V029 | `#/settings/team-access/bus-staff` | 100 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V030 | `#/settings/team-access/agents` | 23 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V031 | `#/settings/team-access/branches` | 14 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V032 | `#/settings/team-access/access` | 835 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V033 | `#/accounts/reports/fleet-operations` | 27 | 0 | `GET /api/accounts/reports/fleet-operations`<br>`GET /api/accounts/reports/fleet-operations/options` | NOT_STARTED | — | — |
| V034 | `#/accounts/reports/driver-behavior` | 23 | 0 | `GET /api/accounts/reports/driver-behavior`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V035 | `#/accounts/reports/staff-duty` | 23 | 0 | `GET /api/accounts/reports/staff-duty`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V036 | `#/accounts/reports/point-usage` | 22 | 0 | `GET /api/accounts/reports/point-usage`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V037 | `#/accounts/reports/metro-bookings` | 25 | 0 | `GET /api/accounts/reports/metro-bookings`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V038 | `#/accounts/reports/van-bookings` | 25 | 0 | `GET /api/accounts/reports/van-bookings`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V039 | `#/accounts/reports/point-performance` | 29 | 0 | `GET /api/accounts/reports/point-performance`<br>`GET /api/accounts/reports/v22/options` | NOT_STARTED | — | — |
| V040 | `#/accounts/reports/station-performance` | 27 | 0 | `GET /api/accounts/reports/station-performance`<br>`GET /api/accounts/reports/v22/options` | NOT_STARTED | — | — |
| V041 | `#/accounts/reports/no-shows` | 22 | 0 | `GET /api/accounts/reports/no-shows`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V042 | `#/accounts/reports/cancellations` | 22 | 0 | `GET /api/accounts/reports/cancellations`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V043 | `#/accounts/reports/frequent-travellers` | 39 | 0 | `GET /api/accounts/reports/frequent-travellers`<br>`GET /api/accounts/reports/v22/options` | NOT_STARTED | — | — |
| V044 | `#/accounts/reports/trip-pnl` | 27 | 0 | `GET /api/accounts/reports/trip-pnl`<br>`GET /api/accounts/reports/v22/options` | NOT_STARTED | — | — |
| V045 | `#/accounts/reports/expenses` | 22 | 0 | `GET /api/accounts/reports/expenses`<br>`GET /api/accounts/reports/v21/options` | NOT_STARTED | — | — |
| V046 | `#/settings/team-access/access/roles/viewer` | 835 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V047 | `#/settings/team-access/access/test-access/viewer` | 15 | 0 | `GET /api/team-access/v26` | NOT_STARTED | — | — |
| V048 | `#/settings/team-access/access/groups/viewer` | 13 | 0 | `GET /api/team-access/v26`<br>`GET /api/team-access/v28/groups` | NOT_STARTED | — | — |
| V049 | `#/settings/team-access/access/advanced/viewer` | 16 | 0 | `GET /api/team-access/v26`<br>`GET /api/team-access/v28/rules`<br>`GET /api/team-access/v28/groups` | NOT_STARTED | — | — |

## Coverage limits of this inventory

- Elements are those rendered on each view's initial load at 1440×900 plus the captured interaction states; nested dialogs that need multi-step data (e.g. a specific booking) are only listed where `states.json` captured them.
- Legacy endpoints not called by any captured view are still listed in `UI_WORKFLOW_MATRIX.csv` (column `called_by_ui` empty).
