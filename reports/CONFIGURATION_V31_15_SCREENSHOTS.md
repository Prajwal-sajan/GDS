# Configuration v31 — 15 continuation screenshots, functional implementation audit

Branch: `savetrip-screenshotcomplete`; extends Configuration v30 (20 earlier screenshots).
Reference: SaveTrip Configuration screenshots uploaded on 23 November 2026.
Only details visibly present are claimed as screenshot-verified; unseen option lists use sensible configurable alternatives and are not asserted to be exact SaveTrip lists.

## Screenshot-to-control reconciliation

| Screenshot | Panel/controls captured | Implementation |
|---|---|---|
| 201225 | Pricing: Dynamic Pricing and Sarathi toggles; manual pair fare hold 3 H and full explanatory note | pricing |
| 201249 | Office Booking: default hold and maximum hold dropdowns, until departure value, unpaid-seat rationale | office |
| 201304 | Vehicle Alerts: enabled switch; Fuel Theft Detection, fuel drop 10 L, window 20 MIN, odometer 1.0 KM, 0.1 HRS | vehicle |
| 201322 | Overspeed speed 90 KM/H, consecutive readings 2; Excessive Idling | vehicle |
| 201339 | Idling 45 MIN, max odometer 1.0 KM; Device Offline 60 MIN; alert recipients | vehicle |
| 201356 | Additional scroll of Vehicle Alerts / recipient number chips | vehicle |
| 201415 | Expenses: Diesel Cost Per Litre, reference 99.28 ₹/L, explanation | expenses |
| 201439 | Seat legends: gender swatches, fill/outer-ring selectors, seven booking-channel checkboxes, colors and footer rule | seats |
| 201502 | Post-Trip Monitoring: enabled switch, monitoring window/TTL/cooldown, move distance/geofence/speed | monitoring |
| 201518 | Engine on/idle/fuel drop liters and percent, all 10 monitoring thresholds | monitoring |
| 201538 | WhatsApp Alerts enable toggle and recipient chips | whatsapp |
| 201553 | Continued WhatsApp Alerts recipient editing | whatsapp |
| 201620 | AI Bot enabled toggle, response user types, maximum messages, delay, escalation chips | bot |
| 201638 | AI Bot response behavior chips and Metro Integration | bot |
| 201655 | Free metro ticket switch, metro exchange point, multiline metro ticket instructions | bot |

## Engineering implementation

- New schema: `server/configuration-v31-schema.js` — eight sections, strict types, numeric bounds, enums, duplicate-free phone/keyword arrays, seat HEX colors, cross-field office hold validation.
- Saved as subsections in existing `configuration_ui`? **No** — v30 settings use `config_v30` metadata, so v31 intentionally extends the same `config_v30` record and API at `/api/settings/config-v30`. No migration or alternative persistence.
- UI: `public/js/configuration-v31.js` registers eight pages against v30; `public/css/configuration-v31.css` extends the same design system.
- Shared Save and left menu unchanged, settings.view/settings.modify permissions retained, audit events captured by existing API.
- Seat legends: `public/js/seat-legend-v31.js` fetches safe seat style preferences via a schedules.view-gated endpoint, colors booked seats in internal Book/Manage views and selectively applies channel rings while preserving blocked, selected, hold, no-show, passenger/copy defaults. The seat-layout response supplies only boolean My/My branch flags without disclosing new phone numbers.
- Office Booking: saved hold policy restricts new unpaid staff/counter/agent bookings; requested durations are bounded by default/max and scheduled India-local departure time. Other bookings retain existing hold behavior until separate workflows adopt the policy. The setting's default is not applied retroactively without being saved.
- Expenses: reference ₹99.28/L is displayed as a sample placeholder, not silently copied into an operator's financials. No fictitious fuel consumption or actual trip expense is generated.
- Vehicle/Post Trip: screenshot threshold fields are saved; no fabricated GPS, fuel telemetry, alert delivery or detection worker.
- Pricing: preference toggles never promote unvalidated RevenueMax models or publish fares. Dynamic fare updates remain isolated from this settings UI.
- AI Bot, Sarathi, WhatsApp and free metro tickets: configure requested values only, no automatic bot response, messaging or metro entitlement without authorized integrations.

## Additional controls that were not expanded in reference

Office hold duration dropdowns, seat fill/ring mode dropdowns, AI user-type choices, and colour-picker widgets have working and documented option sets inferred from user intent; their complete provider option lists are **not** visible in screenshots. They must be compared during live reference UAT before declaring pixel/behavior identity.

## Acceptance and limitations

Run `node tests/configuration-v31-api.cjs`, `node tests/configuration-v31-ui.cjs`, `node tests/configuration-v31-seat.cjs`, followed by `npm test` and Access/v30 regressions. Browser UAT, authorization, device/provider E2E and visual screenshot diff remain prerequisites for production certification. Do not copy the reference operator's personal numbers, diesel rate, company name or metro partnership into another tenant.
