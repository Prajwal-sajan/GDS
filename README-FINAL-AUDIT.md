# JourneyOS GDS — final cumulative screenshot reconciliation (21 November 2026)

## Evidence and certification

This is a **cumulative, non-destructive overlay package**, based on the current public GitHub `Prajwal-sajan/GDS` Node/Express SPA and all visible screenshot batches supplied in this chat. The screenshots are UI evidence, not API/transaction proof. The original repository is *not* fully bundled: this ZIP must be unpacked over a clean checkout and keeps existing `server/*`, original frontend modules and databases intact. **Not end-to-end certified; do not deploy to production.**

Evidence matrix: `SCREENSHOT_FEATURE_RECONCILIATION.csv` with **145 independently classified screenshot features**. Status counts: {'BASE_PRESENT_UNVERIFIED': 27, 'OVERLAY_STATIC_CHECKED': 44, 'NOT_VERIFIED': 20, 'NOT_IMPLEMENTED': 54}. `OVERLAY_STATIC_CHECKED` means an overlay exists and its structural tests pass, **not** functional completeness. `BASE_PRESENT_UNVERIFIED` means the existing app has corresponding implementation paths, not browser-tested behavior. `NOT_IMPLEMENTED`/`NOT_VERIFIED` are mandatory remaining gaps.

## Included overlays

- `trip-parity.js/css`: pickup/drop/timing/document/crew/communications enhancements.
- `accounts-parity.js/css`: sales/transactions/receivables/manual ledger/report shortcuts.
- `schedule-parity.js/css`: schedule tabs, fare and trip updates, booking/seat action affordances.
- `route-parity.js/css`: additive route master and policy configuration. GPS halt feed remains explicitly simulated.
- `communications-access-parity.js/css`: chat inbox, calls list, IAM wrappers; call action is now **manual call record**, never false cloud dialing.
- `fleet-operations-parity.js/css`: NEW vehicle search, state/health filters, sort, cards/list, metrics and actual available API detail panel. Native fleet management retained as a fallback.
- `public/index.html`: cumulative overlay loading, original app scripts preserved.
- `tests`: original and expanded static checks. `SCREENSHOT_FEATURE_RECONCILIATION.csv`: feature-level evidence.

## Important implementation gaps — all remain OPEN

1. **Provider integrations:** Real GPS fleet map/live position history/engine ECU health/predictive algorithms; authenticated PSTN call origination/recordings; WhatsApp/SMS receipt status; official OTA ratings/search-rank sync; payments/refunds.
2. **Booking atomicity:** true live two-desk seat state and gender/couple exception enforcement, cancellation/refund accounting, schedule-versus-route overrides and trip-level actions with audit.
3. **Rich visual editors:** coach lower/upper layout generation and validation, non-seat fixtures, staff 5-tab HR details, bank/payables/document security and full ticket detail panel.
4. **IAM:** server-enforced Off/Own/Branch/Company scopes, role templates, branch bookkeeping and agent isolation; UI gating alone is insufficient.
5. **Reports and Sarathi:** per-service activity with real evidence, daily ops KPI cross-checks, grounded AI responses with authorization and history.

**Unsupported or screenshot-only data must never be substituted by random demo values and labeled as live.** The base GitHub repository contains a deterministic simulation in route halts; the overlay exposes that distinction. The base UI's former `callNow` claimed a masked cloud call was connecting even when it only wrote records; the cumulative patch explicitly changes this to a manual call log.

## Apply to CLEAN checkout, not the other JourneyOS GDS architecture

The connected GitHub repository is a Node/Express single-page app, with `server/index.js` and `public/js/*`. This package is **not** for the separate .NET/PostgreSQL `C:\JourneyOS\GDS-Dev` solution. Do not extract it into that solution. The earlier answer's `GDS-Fresh` path is only correct if that folder actually contains this same GitHub repository.

```powershell
# In the clean checkout of https://github.com/Prajwal-sajan/GDS
cd C:\JourneyOS\GDS-Fresh
git status --short
git switch -c feature/all-screenshot-parity-audited
Expand-Archive "$env:USERPROFILE\Downloads\JourneyOS_GDS_FINAL_Cumulative_Audited_20261121.zip" -DestinationPath . -Force
node tests/check-static.mjs
node tests/check-communications-access.mjs
node tests/check-final-reconciliation.mjs
npm install
npm test
npm start
```

Do NOT overwrite files with uncommitted changes. This bundle overwrites `public/index.html` but adds other files; review `git diff` before merging. Run user-role browser UAT, concurrency booking tests, provider sandbox verification, finance reconciliation and security tests in nonproduction environments. We have **not** run these in the current container.

## Screenshot-specific unusual details requiring review

- Coach screenshot shows **48 seater configured but only 44 bookable seats** because fixture rows (side exit, toilet, roof/back exits) occupy layout positions; capacity/count validation must distinguish seats from physical grid items.
- Route UI may show **recurrence plus service date**; recurring vehicle alternation should be on actual operating trips, not calendar day parity.
- Fleet screenshot distinguishes **connected GPS vs device offline** and **health timestamp**; GPS availability is not equivalent to live operational accuracy.
- Ratings screenshot distinguishes RedBus **all-time** score from **selected date** ratings; the two must never be interchanged. Search-rank history can be delayed/incomplete.
- Calls screenshot shows **routing legs** and answered/skipped/missed states, not simply a call row. Provider-reported connection/recording required.
- IAM screenshots specify **Off / Own / Branch / Company**, plus action-specific toggles. Security must be enforced in API queries and mutations.
- Seat screenshot shows **female/male/blocked/no-show/selected** states and a **couple-in-one-booking** adjacency exception. Neither is established by a static seat diagram alone.
- Screenshots show personally identifying customer/staff/contact and bank details. Never use captured competitor personal data as seed/test data or expose sensitive fields without consent and roles.
