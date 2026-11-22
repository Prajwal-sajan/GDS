# About v32 screenshot coverage — JourneyOS GDS

Source: two user-uploaded SaveTrip Settings → About screenshots, 22 November 2026. Target: own-product JourneyOS Operator, not reference operator account.

## Screenshot 1 (page top)

- Existing global navbar is **reused** (logo, Trips, GDS, Chats, Calls, language and Settings).
- Centered 860px hero panel with rounded light-blue/pink/gold gradient and bus square icon.
- Own-product name **JourneyOS Operator** instead of copying SaveTrip Operator branding.
- Domain link derives from current \`location.host\`, opens same installation in a new tab.
- Multi-tenant GDS operator description, with four outlined feature pills (GDS Schedules, Tripsheets, Passenger Chats, Bookings), each linked to the existing permitted module.
- Build & Version panel: layered icon, headline, short subtitle, status badge from actual environment. **UAT** appears only when configured; otherwise the real environment label is displayed.
- Three icon/value rows VERSION, BUILT or COMMITTED when build timestamp absent, COMMIT; version comes from package.json, commit from deployment metadata or local Git HEAD. No screenshot sample hashes are stored.

## Screenshot 2 (continued scroll)

- Full-width gradient **Check for updates** button (refresh icon).
- Real read-only no-cache API endpoint compares browser-served build ID against newly fetched deployed server build ID; detects waiting service worker; exposes **Reload to update** only after a real difference. If build metadata is unavailable, explicitly reports comparison unavailable instead of falsely claiming latest.
- Install app card with download icon, subtitle and full-width gradient **Install app** button.
- Installability uses verified manifest, 192/512 real PNG icons, network-only service worker, browser beforeinstallprompt/userChoice/appinstalled events, standalone detection, and supported manual Add to Home Screen fallback. Never reports success before browser confirmation.
- Small muted footer: Made for bus operators · © JourneyOS.
- Accessible keyboard focus, status announcements, mobile layout and reduced-motion support.

## Data and security

- Backend \`GET /api/about/build\` guarded by \`settings.view\` and private no-store response.
- Startup-known build identity uses \`GDS_BUILD_SHA\`, CI/platform commit envs or Git HEAD. \`GDS_BUILD_TIME\` may be supplied by deployment; absent actual build time is shown as COMMITTED (if available), never invented.
- App HTML includes safely escaped **served build ID** and is no-store. This closes the stale-tab comparison gap.
- Service worker only performs network fetch of navigations and caches **no** API, booking, passenger, session, GPS, or PNR data. Offline use not claimed.
- PWA install prompt is browser dependent; on an insecure remote origin or unsupported browser the UI provides instructions rather than pretending to install.
- Environment and version values **not copied** from SaveTrip screenshots. The reference screenshot version/commit belong to another application.

## Implementation

- \`server/about-v32-build.js\`; \`server/api/about-v32.js\`; \`server/index.js\`
- \`public/js/about-v32.js\`; \`public/css/about-v32.css\`
- \`public/manifest.webmanifest\`; \`public/sw.js\`; \`public/icons/journeyos-{192,512}.png\`
- \`public/index.html\` loads About after earlier Settings, Configuration v30/31, and before main router.
- Acceptance: \`tests/about-v32-api.cjs\`, \`tests/about-v32-ui.cjs\`, existing Configuration and Settings regressions.

No dropdowns, editable fields or filters are visible in either About screenshot; none have been fabricated for this read-only page.
