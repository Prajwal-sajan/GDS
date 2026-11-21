# SaveTrip GDS Routes + Schedules visual fidelity patch v7

## Scope and reference evidence

Reconciliation against **21 individual Routes** and **33 individual Schedules** screenshots, each reopened by its original file. See `reports/ROUTES_SCHEDULES_V7_54_SCREENSHOT_REAUDIT.csv` for one row per image and `reports/ROUTES_SCHEDULES_V7_DESIGN_TOKENS.md` for reference-sampled colors.

## Changes since v6

- **Routes:** Repaired malformed list-template output that leaked markup into the screen. Added missing **read-only** API summary fields (`alt_name`, `via_names`, coach identifier, arrival day, start/end dates). Reconstructed selected state, service pills, icon action wells, coach badge, graph, smaller borders, subtle shadows and gradient header using sampled design colors.
- **Schedules:** Added a two-line seven-day date rail and a date picker; sortable SERVICE/DEPARTURE/ARRIVAL/COLLECTION headers; amber header and taller booking rows; three actual fare values when returned by the API; tiered blue/red/green collection values with a ring. `—` represents missing settlement fields rather than synthetic figures.
- **Schedules actions:** Added a delete icon with permission gating and explicit confirmation, routed through the existing delete endpoint. The server refuses deletion when confirmed bookings prevent it. Improved modal tabs, stop cards, seat colors, SVG steering wheel and action buttons.
- **API:** Read-only additions to `server/api/master.js` and `server/api/ops.js` to display route/service data already present in local storage, including via cities, coach and route fare/arrival-day data. No new credential scraping, external integrations, or unsafe fare publication.
- **Caching:** Route and Schedules assets use `?build=7` on index references so fresh browser loads aren't silently served older frontend files. Console marker `window.__ROUTES_SCREENSHOT_BUILD__` / `window.__SCHEDULES_SCREENSHOT_BUILD__` is `2026-11-21-routes-schedules-v7`.

## Apply safely (Windows PowerShell)

**Only in `C:\JourneyOS\GDS-Fresh`** (the cloned `Prajwal-sajan/GDS` app). The different `C:\JourneyOS\GDS-Dev` repository uses a different remote and application architecture.

```powershell
cd C:\JourneyOS\GDS-Fresh
git status --short
git switch -c feature/routes-schedules-v7
Expand-Archive "$env:USERPROFILE\Downloads\SaveTrip_GDS_Routes_Schedules_v7_Visual_Fidelity_PATCH.zip" -DestinationPath . -Force
node --check .\public\js\routes-screenshot-v5.js
node --check .\public\js\schedules-screenshot-v6.js
node .\tests\check-routes-schedules-v7.mjs
npm install
npm test
npm start
```

After opening the app, **Ctrl+Shift+R** to refresh. Inspect in DevTools:

```javascript
window.__ROUTES_SCREENSHOT_BUILD__ // after opening Routes
window.__SCHEDULES_SCREENSHOT_BUILD__ // after opening Schedules
```

The patch ZIP is **incremental** and needs the previous v6 cumulative patch. A separate cumulative v7 ZIP includes the whole app from the available v6 snapshot plus v7 fixes. Do not expand either ZIP over a dirty checkout without reviewing changes first.

## Test coverage / exclusions

- Source syntax checked by `node --check` for both UI scripts and both modified API files.
- Fixture-level browser smoke tests pass for Routes list/edit/fare rules/stops and Schedules list/date/sort/nine tabs/seat map/popups, with no browser JavaScript errors.
- Cumulative frontend/static checks pass. Full `npm test` could not run in this isolated environment because `express` dependencies are not installed; run `npm install` / `npm test` locally.
- **Not established:** precise visual parity at every viewport, production authorization, live OTA, GPS, voice, auto pricing, and backend completeness. Missing payout/margin values are intentionally not fabricated.
- **Not pushed:** nothing changed on the user’s Windows machine or GitHub by creating these files.
