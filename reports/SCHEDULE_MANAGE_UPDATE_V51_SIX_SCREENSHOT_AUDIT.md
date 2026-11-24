# Schedule → Manage → Update v51 — six-screenshot implementation audit

## Source and scope

Six user-supplied reference screenshots dated 20 Nov 2026. Target: **Schedules → Manage → Update** only, including its **Edit** mode. The existing v48 Bookings, v49 PNG Copy, v50 booking-link Share, CRM and Vehicle templates are left intact.

| Screenshot | Captured reference controls and geometry | Implementation |
| --- | --- | --- |
| 1 — Update overview, upper section | Navigation tab active in blue/purple; summary banner with blue bus SVG, active pill, service number, city arrow, date, departure/arrival, coach text, occupancy ratio, red progress strip; pale aqua bordered **Vehicle & Staff Assignment** card, round Edit pencil; route source badges; vehicle number; multiple driver/helper names and green phone badges | `public/js/schedule-update-v51.js` uses existing live schedule detail and authenticated schedule Update v51 read API. Card layout, headers, badges, actual roles/phones, responsive CSS in `public/css/schedule-update-v51.css`. No hardcoded NTHB1/phone/route/occupancy. |
| 2 — Update overview, lower section | Four **Cloud Calling**, **Passenger Number Masking**, **Direct to Vehicle**, **Driver Mobile GPS** ON/OFF cards; escalation contact chips; **Autos & Cabs** mode from route; **Schedule Details** with service/name/coach/Coach Transfer and 3 compact indicator badges; **Sync with Route** switch and explanatory text; **Missing on RedBus / AbhiBus?** checkbox; OTA resync button and Close footer | Routed read-only toggles reflect actual `route.call_settings` unless a schedule override exists. Escalation contacts and cab mode derived from persisted source, not invented demo values. Website/provider data is not guessed. Coach Transfer keeps its existing safe preview. The three pictographic reference indicators have *unverified* meanings and remain display-only instead of attaching dangerous invented behavior. |
| 3 — Missing-OTA hover | Warning triangle over `Sync with OTAs`, black rounded tooltip with yellow **WHAT'S MISSING**, instruction to tick the box; Close | Warning tooltip and checkbox reproduced. No OTA API connected in standalone repository: server endpoint explicitly responds HTTP 501 (not connected), never claims a push or changes inventory. |
| 4 — Edit mode upper | Edit becomes Cancel; vehicle dropdown; existing staff rows with role dropdown, staff name selection, phone input, red trash; Add Staff dashed button; source badges and vehicle location | Toggle into v51 edit view without changing route template. Vehicle/staff options from permitted existing vehicle/Staff records. Contact phone editable as schedule-local override, not staff master record. Removing/adding/selecting crew updates client draft. |
| 5 — Edit mode lower | Cloud Calling / Number Masking / Direct to Vehicle / Mobile GPS green/grey physical switches, escalation input, cab segmented **Off, Pickups, Drops, Both**, gradient **Update Assignment** button, text about disabling sync | All are persisted by restricted `PUT /schedules/:id/update-v51/assignment`, with explicit consent and validation. Saves vehicle, roles/IDs, contact override, four boolean call-routing preferences, escalation phone list and cab coverage as schedule-specific settings. **No external telecom/GPS/cab provider is provisioned or called merely by toggling flags.** |
| 6 — Edit mode bottom | Full Schedule Details pills, coach button, compact triad indicators, Sync with Route, Missing on RedBus/AbhiBus and warning tooltip | Same read/edit content maintained below the edit action; persistent `Sync with Route` requires confirmation and refreshes route-based assignments/config. Disabling sync freezes pre-existing route seat blocks instead of accidentally exposing reserved seats. |

### Details preserved

- Layout: rounded light-blue cards, lavender/pale blue trip banner, bright blue/purple gradient icons and action button, soft-shadow bordered form inputs, rounded green phone pills, blue route source pills, orange schedule source pills, red delete icons, green active/ON and grey OFF, rose occupancy strip and thin borders.
- SVGs: bus/vehicle, staff, call/cloud, shield masking, phone, GPS/compass, alert, calendar, clock, tag, edit pencil, plus, trash, sync arrows, chevrons, route/auto, and coaching/seat layout.
- Staff: Driver/Helper/Attendant/Conductor/Pickup Van roles, unique active staff, validated license-role selection as appropriate, 8-row maximum, contact override (does not modify `/staff/:id`).
- Cab modes: Off / Pickups / Drops / Both. Initial mode uses route value if present; it is **not defaulted to Drops** merely because the screenshot shows Drops.
- Source labels distinguish existing route configuration from schedule-specific overrides.
- Buttons: Edit, Cancel, Add Staff, delete staff, Update Assignment, Coach Transfer (safe preview), Close, route sync, OTA warning.
- Persistent changes have server-side permissions, input validation and audit, not just browser-local draft storage.
- Booked seat safety: coach swap blocked when seat geometry changes with active confirmed/held bookings. On disabling route sync, original route seat blocks are snapshotted onto the trip so crew/private seats are not released. On re-enabling sync, only those snapshots are removed and trip-specific v51 overrides are reset; changing booked trip departure time during re-sync is rejected.
- Date, time, service number, coach, travel path, crew, phones, occupancy and route labels are sourced from actual GDS records. The screenshot's example values are not hardcoded.

### Explicit limitations and deployment gates

1. **External systems:** Cloud calling, number masking, driver mobile GPS, cab dispatch, and OTA synchronization require actual authorized provider integrations. v51 persists intended schedule configuration; it does *not* claim that provider-side behavior is active or send notifications to customers. OTA push is explicitly unavailable rather than silently succeeding.
2. **Coach Transfer:** Existing safety preview is preserved. A production coach transfer involving live bookings needs validated physical seat-ID migration; no unvalidated coach swap is performed.
3. **Unlabeled indicator trio:** Three ON/OFF icons visible in the screenshots do not disclose exact meanings. They are rendered as visual indicators with explanation, not fake operational switches.
4. **Exact screenshot typography and pixel parity:** CSS follows the visual reference; browser/device side-by-side UAT still needed for a literal pixel-match claim. Data differences depend on real service details.
5. **Access:** Schedule Update needs `schedules.view`; changing the assignment needs `schedules.modify`, fleet/staff visibility and applicable advanced access rules. A restricted user's missing options will not be fabricated.

### Files

- `public/js/schedule-update-v51.js`: v51 reference UI, full form handling, input and permissions.
- `public/css/schedule-update-v51.css`: isolated visual system; responsive two-column and form layouts.
- `public/js/schedules-screenshot-v6.js`: exclusive Update tab integration, change handlers, modal footer.
- `server/api/schedule-update-v51.js`: authenticated GET, assignment PUT, route sync PUT, unconnected OTA POST.
- `server/api/ops.js`: effective per-schedule staff contact phone reflected across schedule details.
- `server/index.js`, `public/index.html`: API/script/style registration.
- `tests/schedule-update-v51.test.cjs`: screenshot DOM, assignments, phones, permissions and safety, route sync, OTA fail closed and regression wiring.
- `.github/workflows/schedule-update-v51.yml`: v51 verification plus existing v50, v49, v48 and full GDS regressions.

### Manual acceptance

Open a service with a genuine coach and staff assignment; review 6 screenshots side by side; click Edit; change assigned staff member and optional trip phone; test all four switches, escalation list and cab selection; Update Assignment; reload and verify Schedule-source badges and saved values; turn Sync with Route on and verify route defaults return; deny permissions, attempt incompatible coach transfer, and verify OTA Sync does not pretend success. Verify records and reserved seat statuses are unchanged unless an explicitly permitted assignment was saved.
