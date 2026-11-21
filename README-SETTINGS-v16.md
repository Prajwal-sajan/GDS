# Settings Screenshot Replica v16

This repo contains the cumulative GDS frontend from previous modules plus the Settings v16 implementation.

## Run on Windows (PowerShell)

```powershell
cd C:\JourneyOS\GDS-Fresh
# Confirm `git remote -v` points to Prajwal-sajan/GDS, not E-Yatra.
git status --short
# Take a branch/backup before applying the overlay ZIP.
git switch -c feature/savetrip-settings-v16
Expand-Archive "$env:USERPROFILE\Downloads\SaveTrip_GDS_Settings_v16_OVERLAY.zip" -DestinationPath . -Force
npm ci
node --check .\public\js\settings-complete.js
node .\tests\check-settings-v16-backend.cjs
npm test
npm start
```

Open `http://localhost:3000/#/settings/team-access/office-staff`, `http://localhost:3000/#/settings/team-access/access`, or `http://localhost:3000/#/settings/branding` after logging in.

**Important:** The overlay is designed for the v14/v15 SaveTrip GDS snapshot, not arbitrary branch states. Preview `git diff` and do not force the patch over conflicting changes. Do not reseed a production database; using `GDS_RESEED=1` wipes demo data.

The screenshot audit and tests are under `reports/settings-v16/` and `tests/`. The API/business-function limitations are documented in `reports/settings-v16/VERIFICATION_REPORT.md`.
