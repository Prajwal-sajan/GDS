# SaveTrip screenshot-first Routes v5 (2026-11-21)

This is a user-supplied screenshot based UI recreation for the GDS > Routes submenu in the `Prajwal-sajan/GDS` Express/vanilla-JS app.

## Contents
- `public/js/routes-screenshot-v5.js`: route list and comprehensive route editor UI; wraps `G.screens.gds` for routes only.
- `public/css/routes-screenshot-v5.css`: visual matching styles with compact icon wells, rounded chips, cards, gradient header, tables and coach diagrams.
- `public/index.html`: load routes-v5 assets after v4 visual overlay and before main script.
- `reports/ROUTES_V5_SCREENSHOT_MATRIX.csv`: each of the 21 original Routes screenshots, distinctive UI details and known limits.
- `reports/ROUTES_V5_REAUDIT_NOTES.md`: section-level comparison and test summary.
- `tests/check-routes-v5.mjs`: structural verification; `tests/routes-v5-browser-smoke.py`: headless Chromium UI fixture.

## Local installation
Before extracting, back up uncommitted changes. The cumulative ZIP can replace previously customized files.
```
cd C:\JourneyOS\GDS-Fresh
# git switch -c feature/routes-v5
Expand-Archive "$env:USERPROFILE\Downloads\SaveTrip_GDS_Cumulative_UI_Replica_v5_Routes.zip" -DestinationPath . -Force
node --check .\public\js\routes-screenshot-v5.js
node .\tests\check-routes-v5.mjs
npm ci
npm test
npm start
```
Open GDS > Routes and hard-refresh. Console build marker: `window.__ROUTES_SCREENSHOT_BUILD__` returns `2026-11-21-routes-v5`.

## Scope / safety
This is **not** a certified pixel-perfect copy and **not** operational backend completion. Editor Save Changes saves browser-local preview configuration, not route/booking/fare rules to the server. The source GPS halt endpoint returns simulated values; no real stop correction can be certified. Existing native backend endpoints support some list/action operations; compare permissions before use. All other submenus remain v4.

## Test evidence
`node --check`, `node tests/check-routes-v5.mjs`, the four v4 static tests and a synthetic headless Chromium interactions smoke test passed here. The complete npm test could not be run in this environment (`npm ci --offline` missing uncached dependencies). No live authenticated SaveTrip pixel diff was performed.
