# Vehicles → Coaches → Edit Coach — A/C Seater (2+2)

## Screenshot-to-implementation audit · v47 · 23 November 2026

**Inputs:** Six attached SaveTrip GDS screenshots showing a single Edit Coach modal scrolled through its complete seat-layout and configuration sequence. This report records visible elements and their implemented counterparts. Exact pixels/real operator seat assignments still require manual side-by-side UAT.

### Common modal shell across all six screenshots

- Dark grey overlay; centered large, softly rounded white modal.
- Blue → violet gradient header with bus SVG, **Edit Coach** title, **A/C Seater (2+2)** subtitle, circular X close control.
- Fixed modal header/footer; white scrollable middle content; persistent **Coach Type**, **Amenities**, and highlighted **Seat Layout** three-tab bar, each with SVG.
- Footer aligned right: white **Cancel** button and filled royal-blue **Update Coach** button.
- Existing tab navigation and saving from `public/js/vehicles-parity-v9.js`, screenshot styling from `public/css/coach-2plus1-v46.css`, augmented only for 2+2 by `public/css/coach-2plus2-v47.css`.

### Screenshot 6 (configuration overview)

- Light cyan **Current Configuration** card.
- **Bus Type:** A/C Seater (2+2) (actual stored coach field).
- **Layout:** 2+2 (5 columns with gangway, max 16 rows).
- **Seaters: 48 | Semi-Sleepers: 0 | Sleepers: 0**, and separately **Total Seats: 44**.
  The screenshots present a 48-position numbering envelope with only 44 actual bookable positions. v47 explicitly models `nominal_seater_positions:48` and `capacity:44`; the occupied four positions represent facilities/safety clearance.
- **Generate Layout** at right. For unassigned A/C Seater 2+2 templates, it regenerates 44 seats + four layout fixtures as an unsaved draft. For assigned templates it is disabled to avoid booking/inventory corruption.
- Rounded white legend with dashed outline **Available**, blue **Male (Booked)**, pink **Female (Booked)**, graphite **Blocked**, orange **No-show**, green **Selected**.

### Screenshots 1–4 (coach diagram while scrolling)

- One vertically elongated rounded-border **LOWER** deck, centered in large light panel; no upper deck for this template.
- Glossy steering-wheel SVG on right of deck header and horizontal dashed divider.
- Five layout columns: two left-side seats, aisle, two right-side seats.
- Each available seater uses a dashed blue outer outline, internal light-grey number capsule, and small seat cushion/shadow below.
- Rows 1–4 have 1–16 in the sequence 1,2 | aisle | 3,4; 5,6 | aisle | 7,8; 9,10 | aisle | 11,12; 13,14 | aisle | 15,16.
- Row 5: **17,18** on left, Side Exit at **R5C5Z0**; the right inner cell is safety clearance. Numbers 19 and 20 are not bookable.
- Row 6: **21,22** on left, **Toilet** occupying **R6C4Z0 and R6C5Z0** (horizontal rectangle, two-person grey SVG). Numbers 23 and 24 are not bookable.
- Rows 7–12 resume pairs: 25,26|27,28; 29,30|31,32; 33,34|35,36; 37,38|39,40; 41,42|43,44; 45,46|47,48.
- **Roof Exit** at **R8C3Z0** and **Back Exit** at **R12C3Z0** in the aisle, both with red emergency SVG.
- Red rear door indicator at bottom of deck. This indicator disappears if its actual fixture is deleted.
- Fixture positions are not passenger seats; grid safety validation prevents passenger seats from overlapping any fixture or blocking side-exit clearance.
- Non-screenshot A/C seater layouts already assigned to real vehicles are preserved; no silent reassignments or ticket-code renumbering.

### Screenshot 5 (seat configuration header and editor actions)

- **Seat Configuration (44 Total seats)**.
- **Search by seat ID or type…** editable search input with icon; filters displayed configuration rows.
- **+ Add Seat** action (unassigned coach only): requests a unique seat code, Lower deck and Seater type; places the seat only in a verified empty and safe 2+2 cell. It does not remove existing exit/washroom fixtures.
- **Reset Names** resets only display aliases, not the underlying seat codes used for booking.
- Cyan tip strip explains immediate updates to the seat map when a display name is edited.

### Screenshots 5–6 (seven-column seat table)

| Column | Behaviour |
| --- | --- |
| # | Sequential table number |
| Display Name (Editable) | Rounded white editable input, live update to seat or fixture diagram; does not change booking seat ID |
| Type | Green SEATER; red EE_EXIT / ROOF_EXIT / BACK_EXIT; slate WASH_ROOM |
| Deck | Lower |
| Orientation | Dash for seats/exits; blue **↔ Horizontal** chip for Toilet |
| Position (Grid) | Exact one-based R/C/Z coordinate strings, Z0=Lower |
| Actions | Red trash SVG. Removal requires explicit confirmation and is disabled on assigned coaches |

The final four reference rows are **45 Side Exit**, **46 Toilet**, **47 Roof Exit**, and **48 Back Exit**, with exact grid coordinates stated above.

### Backend and safety

- `public/js/coach-2plus2-v47.js`: pure builder, diagram renderer, table positions, fixture validation, add/delete, stable structural signatures.
- `server/api/master.js`: recognizes only actual **A/C Seater 2+2** coach templates; validates 5-column geometry, row bounds, 44/48 metadata, uniqueness, no overlaps, fixture clearance and persisted display aliases. Requires existing `fleet.modify` and existing advanced **Create & edit coaches** authorization.
- Unchanged generic `D.buildLayout({kind:'seater',pattern:'2+2'})` is retained for the pre-existing non-A/C pickup van. Only the target A/C Seater template gets the reference 44-seat layout on create/generation.
- Assigned coaches cannot change physical seat IDs, type, count, location or fixture geometry; alias-only changes are permitted. This prevents accidental changes to current bookings.
- For older existing 40/48-seat A/C coaches, the editor renders real persisted inventory instead of silently converting it to the screenshot’s 44-seat example.

### Automated acceptance
The dedicated `node --test tests/coach-2plus2-v47.test.cjs` suite covers exact numbering, 44+4 occupancy, coordinates, orientation, SVGs, selection, HTML escaping, edit/add/delete/rename, side exit safety, API creation and save, assigned template protection, RBAC and unchanged pickup vans. The workflow also runs `tests/coach-2plus1-v46.test.cjs`, `tests/check-vehicles-v9.mjs`, and full `npm test`.

**Qualification:** The screenshots show the front-end UI but not all popup states for Add Seat, Reset Names, deletion, or API submissions. Those flows are implemented using the existing GDS conventions, not claimed as externally verified SaveTrip internals. Pixel-perfect appearance must still be confirmed in a rendered browser with a real example coach.
