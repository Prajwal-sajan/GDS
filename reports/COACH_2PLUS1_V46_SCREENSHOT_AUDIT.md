# Vehicles → Coaches → Edit Coach / A/C Seater-Sleeper (2+1)
## v46 six-screenshot audit — 23 November 2026

### Scope
Exactly the **2+1 Seater/Sleeper** coach-editing flow shown in the six supplied screenshots. No replacement of the standard Vehicles listing, other coach types, CRM ticket dialog, fare rules, or unrelated modules.

### Screenshot inventory
| Screenshot / visual element | Source | v46 implementation |
|---|---|---|
| 1–6 — full-screen dimmed overlay, rounded white modal | `vehicles-parity-v9.css` + `coach-2plus1-v46.css` | Scoped `.vp-overlay-coach.cv46-target` styling |
| 1–6 — 135px blue-to-purple gradient header, bus icon, Edit Coach, A/C Seater/Sleeper (2+1), circular X | Existing `panelModal` + v46 CSS | Preserved and calibrated across tabs |
| 1–6 — three persistent tabs: Coach Type, Amenities, Seat Layout; last tab blue/purple active | Existing nav and data-tab events | Seat Layout initially selected for 2+1; switching other tabs keeps modal dimensions |
| 2 — cyan Current Configuration, Bus Type / Layout / Seaters / Semi-Sleepers / Sleepers / Total Seats | v46 `seatsHTML` | Values from coach definition and actual layout, not screenshot-sourced fixture values |
| 2 — Generate Layout | v46 UI, `Coach21V46.build`, `D.buildLayout` | Creates correct LOWER/UPPER geometry and 46 seats; disabled for assigned physical inventory |
| 2 — six status swatches | `cv46-legend` | Available dashed blue; Male Booked blue; Female Booked pink; Blocked graphite; No-show orange; Selected green |
| 3–5 — centered LOWER + UPPER outlines with rounded gray-blue borders | `Coach21V46.renderDiagram` | Two fixed-width separate deck silhouettes, responsive scroll container |
| 3–5 — steering wheel SVG on LOWER heading | Inline SVG within `renderDiagram` | Custom blue wheel; no external image dependency |
| 3–5 — LOWER 1L–6L vertical left column | `Coach21V46.build` | Grid columns 1 / rows 1–12; each sleeper occupies two vertical rows |
| 3–5 — LOWER seaters 1–22 in paired right columns | `Coach21V46.build` | Columns 3 and 4, rows 1–11, with column 2 reserved as aisle |
| 3–5 — UPPER left: 3U / 6U / 9U / 12U / 15U / 18U | `Coach21V46.build` | Column 1, sleepers span two rows |
| 3–5 — UPPER right: (2U,1U), (5U,4U), (8U,7U), (11U,10U), (14U,13U), (17U,16U) | `Coach21V46.build` | Columns 3 and 4, correct paired order and orientation |
| 3–5 — unoccupied seats white with blue dashed outer border, grey lumbar/support bar | `cv46-seat` + `cv46-cushion` CSS | Sleeper elongated, seater compact with number plate |
| 4–5 — red running-man emergency marker and red rear door | `cv46-emergency`, `cv46-door` | Original inline SVG, fixture-aware visibility |
| 6 — Seat Configuration header and seat count, seat search, Add Seat, Reset Names | v46 editor | Working search and editor actions; physical changes restricted for assigned coaches |
| 6 — cyan instruction strip | `cv46-tip` | Display-name changes update layout drawing immediately |
| 1 / 6 — seven-column seat table | `cv46-seat-table` | #, Display Name, Type, Deck, Orientation, Position (Grid), Actions |
| 1 / 6 — seater green / sleeper lavender / Back Exit red labels | `cv46-kind` | Status chips bound to actual type |
| 1 / 6 — vertical orientation chips | `cv46-orientation` | Displayed only on sleeper rows |
| 1 / 6 — position labels, e.g. R3C1Z0, R4C1Z0; R11C1Z1, R12C1Z1 | `tableRows` | Derived from seat row/column/height and lower/upper deck index |
| 1 — trailing Back Exit row | `tableRows` | Physical fixture, not a passenger; contributes one row but not seat capacity |
| 1 / 6 — red trash icons | `data-cv46-remove` | Removes unsaved seat/fixture in unassigned editor; updates counters and diagram |
| 1–6 — sticky footer Cancel / Update Coach | `vp-footer` + v46 CSS | Cancel existing modal close, Update Coach performs authenticated save |

### Exact 46-seat geometry
- **LOWER:** 6 single sleepers (1L through 6L) and 22 right-side seaters (1 through 22), 28 passenger positions.
- **UPPER:** 18 sleepers (3U left / 2U and 1U right, repeated in triplets through 18U / 17U / 16U).
- **Total:** 46 passenger seats + a separate lower Back Exit fixture at R12C2Z0.
- **Grid coordinates:** row 1-based; column 1-based; Z0 lower and Z1 upper; vertical sleeper covers two cells, e.g. 2L = R3C1Z0 and R4C1Z0.
- **Default dimensions:** 4 columns, 12 occupied rows per deck, maximum supported 16 rows.

### End-to-end editing / persistence
- Editing **Display Name** sets `display_name`, never `code`, because the latter is referenced by bookings, seat inventory, and fare rules. The diagram reflects the alias immediately, and PUT /coaches/:id persists it.
- Exit display alias can also be updated without renaming physical Back Exit.
- `Generate Layout` creates the correct 46-seat arrangement. `Add Seat` finds a vacant appropriate position and rejects duplicate IDs/overlaps. `Delete` removes the selected unassigned seat/fixture; `Reset Names` restores stored passenger seat IDs as display names. Changes stay unsaved until **Update Coach**.
- Backend `POST /coaches` and `PUT /coaches/:id` validate v46 seat geometry, coordinates, unique IDs, unique aliases, fixture positions and declared seat count. Operations remain protected by existing `fleet.modify` and the advanced **Create & edit coaches** access control.
- If a coach is referenced by a vehicle or route, changing physical seat positions, seat count or booking identifiers is rejected (HTTP 409) to protect active bookings. Alias-only edits are allowed.
- Older **48-seat** mixed layouts generated by earlier versions are **not silently changed to 46**. The v46 visualization projects their existing coordinates into the correct left-single/right-paired orientation while retaining all 48 actual seat IDs. Migration to 46 requires checking bookings/route assignments and retiring obsolete seats safely.
- Other coach kinds and patterns are intentionally not regenerated or rewritten.

### Screenshot ambiguities and limitations
- The screenshots' original table row order and manufacturer are tied to a specific coach account and cannot be inferred fully. Existing seat ordering and stored manufacturer are displayed; the screenshot's values are not fabricated.
- The screenshot's **Semi-Sleepers: 46** cannot be interpreted as a distinct 46-seat semi-sleeper inventory alongside 22 seaters and 24 sleepers. The GDS uses its stored semi-sleeper count, otherwise 0.
- The screenshots show the **Add Seat** button but not its popup; the implementation uses the GDS's existing prompt interface with Seat ID, Deck, and Type, and automatically places seats in a free valid grid slot.
- Regression tests and syntax verification are not a pixel-by-pixel browser comparison. Visual certification still requires desktop and mobile UAT against the provided images and an operator's actual persisted coach layout.

### Verification
`node --test tests/coach-2plus1-v46.test.cjs` runs geometry, coordinate, 46/47 count, CSS/HTML wiring, legacy projection, alias/XSS boundaries, add/delete, and authenticated coach CRUD.
`node tests/check-vehicles-v9.mjs` ensures the pre-existing Vehicles and Coaches controls remain.
`npm test` runs the full GDS API regression suite.
