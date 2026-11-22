# Vehicles View / Edit — Eight-Screenshot Acceptance Matrix (v19)

Base: `savetrip-screenshotcomplete` (post P&L v18).
Implementation: `public/js/vehicle-detail-v19.js`, `public/css/vehicle-detail-v19.css`, and `server/api/vehicle-details-v19.js`.
Navigation: Fleet → Vehicles → individual row → View / Edit. The detailed panel expands below the fleet listing.

| Screenshot | Exact visible components captured | Working behavior and source |
|---|---|---|
| 1 (View · Details upper) | Back arrow, `View Vehicle Details`, registration subtitle, centered four-icon tabs, 2-column grey canvas, Vehicle Details, Vehicle Specifications, ownership/type purple pills, Notes | Vehicle ID GET, coach lookup, persistent details; View is read-only |
| 2 (View · Details lower) | Fleet ID and phone, permanent/temporary, main/pickup, GPS enabled/device/provider, DMS enabled/device/provider, Notes, tag name/value/Add and helper labels | Edit supports validated GPS/DMS configuration, tags and Notes; save to selected vehicle only |
| 3 (View · Documents upper) | Registration Certificate (RC), Insurance, PUC, Fitness, AITP Form 2, AITP Form 3, document icons and links, Public green/Private segmented controls, expiry dates | Displays eight types in stable order, expiry/visibility from saved documents, Open document when file exists |
| 4 (View · Documents lower) | AITP Form 2, AITP Form 3, VLTD, FDSS, Public/Private permission legend | Missing files labelled honestly; not clickable until uploaded |
| 5 (View · Maintenance) | Service Schedule: last/next service dates, green status; Maintenance Records & Reminders heading and explanatory text, odometer badge, dotted empty state and wrench icon | Date/km due status and chronological records; can add/edit attachments/reminders in Edit |
| 6 (View · Archive) | Archive icon, heading/subtitle, All/Documents/Maintenance count pills, dotted empty state | Archived items filter by type; replaced records retained newest first; crew public-file endpoint denies archived entries |
| 7 (Edit · Details) | Edit Vehicle heading, coach dropdown, registration, fleet ID, mobile, segmented ownership/type, GPS toggle, two-column specs, Notes | Required-field validation, unique registration, no unrelated route/seat mutations; save and reload |
| 8 (Edit · Documents) | Same eight document types, Open link, Replace blue, Archive slate, Delete red, Public/Private pills and expiry editor | PDF/image upload 5 MB; replacing archives previous version; visibility and expiry update; confirmed archive/delete |

## Controls not visible in the supplied viewport but required to complete the pictured workflows

- Maintenance **Add**, **Edit**, **Archive** records, optional service bill/job card attachments, and archive filters.
- Safe file download/view with membership and role checks, allowed MIME formats, and no arbitrary file URLs.
- Back navigation with unsaved-change warning; View/Edit mode switch for permitted operators.
- Responsive layout for narrower screens; coach, route and live fleet table unchanged.

## End-to-end checks

- `node tests/check-vehicle-detail-v19.cjs`
- `node tests/vehicle-detail-v19-ui.cjs`
- `npm test`
- CI: `.github/workflows/vehicles-v19.yml`

## Important data-integrity boundaries

The screenshots show one particular operator's vehicle and document dates; demo data is *not* rewritten to these screenshot values. Real coach/vehicle/expiry data is always read from this GDS. GPS and DMS switches are persisted *configuration*, not proof of device telemetry or provider integration. The existing repository stores uploaded files in its JSON-backed development database; production deployments should migrate attachments to managed object storage with retention controls before using real operator identity documents.

No pixel-difference comparison against a full running competitor application has been asserted; browser DOM/API regressions confirm behavior, structure and screenshot-element presence.
