# v34 Loyalty Program + Switch User — screenshot reconciliation and implementation report

Source: five supplied screenshots (22 November 2026). Target: own GDS `savetrip-screenshotcomplete` branch, not SaveTrip services.

## Screenshot-by-screenshot coverage

| Screenshot | Exact controls and values captured | Implementation |
|---|---|---|
| 201804(4) | Existing global top navigation and Settings, orange Loyalty Program title, **How to** action, green Enabled badge; orange-blue hero gift icon and orange enabled switch; summary Value per Mile ₹0.1, Max Discount 30%, Minimum Miles 1000; Seat Upgrades switch and free upgrade example; General Settings section and Save | v34 UI, v34 API |
| 201840 | General Settings: Value per Mile ₹0.1, Max Discount 30, Minimum Miles 1000, Minimum Booking ₹50; hint descriptions and units; seven weekday limits Mon 75, Tue 75, Wed 75, Thu 30, Fri 0, Sat 30, Sun 0; section Save controls | v34 UI, validated API |
| 201907 | Tier Bonus 4 ordered cards Bronze 1, Gold 1.2, Platinum 1.5, Silver 1.1, reset × icons; Blocked Dates panel and input row | v34 UI |
| 201927 | Date calendar picker, Rate % numeric, Reason text e.g. Diwali peak, pink Save; existing 2026-03-31, 0% row, trash delete action | v34 UI, validated persistence |
| 202336 | Switch User standalone white header with back chevron and user/gear icon; instructional heading and text; Phone Number entry placeholder e.g. 9876543210 with focus border, blue Continue + arrow | v34 UI and guarded endpoint |

No unshown selectors or filters were invented.

## Persistence and configuration

- `GET /api/settings/loyalty-v34` reads existing **miles**, **day_rates**, **tier_multipliers**, **blackout_dates** metadata. It does not create incompatible parallel copies of general rates or tiers.
- `PUT /api/settings/loyalty-v34/:section` validates fields before mutation and audits each section.
- The legacy `PUT /settings/:key` remains supported but now enforces the same validation on miles, rates, tiers, and blocked dates (closes bypass).
- The 2026-03-31 0%-rate reference and weekday screenshot values are seeded for **new local demo databases only**. Existing operator database values remain authoritative and are NOT overwritten.
- Only the seat-upgrade switch is stored in `loyalty_upgrade_v34`; new demo configurations show the screenshot's enabled preference, but automatic upgrades are **not** executed in the absence of passenger consent, verified seat eligibility and transaction-safe seat assignment. UI explicitly marks execution `configuration_only` in API.
- Earlier paid seat upgrade policy remains unchanged.

## Actual booking integration

- `D.priceBooking` now enforces active loyalty, customer mobile/balance, whole miles, minimum booking/miles, daily balance fraction (India-local booking day), travel-date blocked rate, maximum discount after coupon, and tier multiplier on redemption value.
- Changes are applied to both booking quote and booking creation; no-mile bookings retain existing pricing paths.
- Under the displayed value per mile of ₹0.1 and Gold 1.2×, 100 miles are worth ₹12, **not ₹120**. The screenshot's tier example is mathematically inconsistent with its ₹0.1/mile setting, so the UI preserves screenshot wording and the engine uses the actual configured arithmetic.
- Redemption is restricted to paid bookings. Awarding is idempotent on paid settlement and no longer credits unpaid holds; cancellation reverses a proportion of awarded and redeemed miles.
- Ledger records settlement and cancellation reversal. This prototype still uses a single-process JSON store, so cross-process concurrency and distributed-payment atomicity remain production release blockers.

## Switch User security

- `POST /api/auth/switch-user/v34/resolve` accepts a **10-digit phone number**, not arbitrary user-ID selection. Verified active users only, roles strictly below acting owner/admin. User ID is returned only after authorization.
- `auth.middleware` revalidates view-as headers *on every request* and rejects unknown, disabled, peer, higher-privilege, and unauthorized targets (no previous fallback to original user or arbitrary target).
- `GET /auth/switchable-users` only returns eligible lower-level active users for backwards compatibility.
- Persistent view-as banner offers **Return to my account**, even when the previewed role cannot access Settings. The back end records real actor identity and preview target in audit and booking attribution.
- The app is still a prototype single-operator store. Genuine tenant isolation and operator-hierarchy scoping must be enforced before production multi-tenant use.

## Files

`server/loyalty-v34.js`, `server/switch-user-v34.js`, `server/api/loyalty-v34.js`, `server/api/switch-user-v34.js`, `server/domain.js`, `server/auth.js`, `server/api/misc.js`, `server/api/ops.js`, `server/index.js`, `server/seed.js`, `public/js/loyalty-switch-v34.js`, `public/css/loyalty-switch-v34.css`, `public/js/main.js`, `public/index.html`, `tests/loyalty-switch-v34-api.cjs`, `tests/loyalty-switch-v34-ui.cjs`, `.github/workflows/loyalty-switch-v34.yml`.

## Acceptance and remaining release blockers

- Run v34 API and UI tests, legacy GDS, Config v31, WhatsApp v33, About v32 and Access v29 regressions.
- Test the actual layout in a desktop browser against all five screenshots. Source-derived wording and controls are captured, but a browser pixel-diff has not been performed in this run.
- Important: full automatic seat upgrade dispatch, supplier/OTA journey-specific loyalty scopes, financial reconciliation of redeemed points, cross-instance transaction isolation, expired-trip reversal and real payment settlement confirmation still require production-grade integrations.
