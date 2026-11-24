# Schedule → Manage → Bookings → Seat Layout → Copy as PNG (v49)

## Reference and expected outcome

Source: user-supplied 904×1392 seat-layout screenshot showing **Hyderabad → Bengaluru**, **Sun, 22 Nov, 2026 · NTHB1**, two rounded **LOWER / UPPER** 2+1 decks, blue steering-wheel SVG, red emergency exit / rear door, white/blue/pink/navy seats, and the **Available / Male / Female / Not available** legend with a booking-site footer.

**Expected interaction:** Clicking the existing **Copy** button stores an actual PNG in the system clipboard's `image/png` format, allowing a direct `Ctrl+V` into WhatsApp Web/Desktop and other apps that accept pasted images. It does not copy seat-code text or a screenshot of the entire app.

## Screenshot coverage and implementation

| Reference detail | Implemented behavior |
| --- | --- |
| White/light-grey clean poster; no GDS buttons or sidebar | SVG-only illustration converted to PNG. The UI itself is not photographed. |
| Route header in large bold dark type | Uses `S.detail.origin` → `S.detail.destination`; XML-escaped. |
| Date / service subtitle | `travel_date` formatted as *Sun, 22 Nov, 2026* in UTC for stable calendar date, then service number. |
| Large rounded light outer card and two subtly shaded/outlined deck panels | 900 px-wide poster, reference-proportioned twin decks; single deck centered when a coach has one deck. |
| `LOWER` and `UPPER` labels | Labels from actual source deck data. |
| Steering wheel on lower deck | Self-contained custom vector artwork, radial gradient, white rim/spokes, subtle drop shadow. |
| Bus aisle and passenger seat geometry | Grid uses each seat's `row`, `col`, `w`, `h` and deck rows/columns. 2+1 sleeper occupies two row cells; left single berth and paired right seater/sleeper groupings. Supports 2+2 single-deck coach too. |
| Old stored 2+1 geometry | Uses same non-destructive legacy projection as the existing v48 on-screen renderer; does not overwrite or renumber booking seat IDs. |
| White available, blue booked male, pink booked female, navy unavailable | Mapped from **freshly fetched** segment inventory, with booked gender from recognized statuses and booking metadata only. Unknown-gender booking, hold, block, other-leg, no-show become unavailable (no misleading male classification). |
| Seat tiles including bevel, border, cushion bar, internal label, shadow | Each tile is a scalable SVG vector element, rasterized at 2× resolution for clear paste. Seat codes remain visible; no passenger names/phones/PNRs or fares are included. |
| Rear emergency-exit running figure and red door | Embedded original red vector SVG on lower deck; no emoji or external image asset. |
| Four footer legend colors/labels | Rectangular key swatches with `Available`, `Male`, `Female`, `Not available`. |
| Reference booking website `novembertravels.com` | Uses the **actual configured operator booking website** if available. Otherwise uses the operator name or generic “Seat availability at time of copy.” The example domain is never impersonated as another operator's official website. |
| High-quality image paste | Browser-native SVG to Canvas PNG at **2×** (nominal **1800 px** wide), then `ClipboardItem({'image/png': pngPromise})` to `navigator.clipboard.write`. Clipboard write starts **synchronously within the click activation**, even though inventory refresh/image rendering are asynchronous. |
| Latest seat states | On click: fetches `GET /schedules/:id/seat-layout?from_city_id=...&to_city_id=...&copy_ts=...`. The server already uses authorization, current confirmed/held bookings, active blocks, journey-overlap logic and fares. Fails safely if source refresh errors; **never copies the old visible snapshot silently**. |
| Accurate outcomes and browser fallback | `copied:true` only after the browser confirms clipboard write. If image clipboard unavailable/permission rejected, generate and initiate a locally downloaded `seat-layout-<service>-<journey-date>.png`, and show a download-specific toast (not “copied”). If refresh/PNG generation fails, show an error without stale fallback. |
| Privacy and safety | SVG escaping, constrained booking URL label, fixed seat-grid bounds and uniqueness checks, no backend mutations, no external CDN and no private passenger/booking fields in image. |

## Files

- `public/js/seat-layout-copy-v49.js` — pure SVG poster builder, live geometry and status mapping, browser SVG→PNG, user-activation-safe ClipboardItem, verified download fallback.
- `public/js/schedules-screenshot-v6.js` — existing Copy control and click handler; refreshes currently selected schedule segment and reports copied/download outcomes.
- `public/index.html` — adds the v49 script before the schedule screen script.
- `tests/schedule-seat-layout-copy-v49.test.cjs` — 2+1 and 2+2 seat geometry, SVG/XML parsing, 46-seat copy, style/status legend, legacy geometry, privacy/escaping, no stale copying, asynchronous image ClipboardItem, successful write, unsupported clipboard and fallback.
- `tests/schedule-seat-layout-copy-v49-browser.html` — native Chrome SVG/Canvas PNG conversion, decodes actual PNG bytes, checks 2× dimensions and male/female rendered pixels.
- `.github/workflows/schedule-seat-layout-copy-v49.yml` — runs both screenshot-export suites and existing v48, v38 and full GDS regressions.

## Testing and operational limitations

Automated native-browser rendering confirms a valid high-resolution PNG is generated. A real clipboard write still requires a **secure context** (HTTPS or localhost) and Chrome/Edge or another browser supporting image clipboard writes. Some mobile browsers, remote-desktop policies and permission settings may block image clipboard access; the download fallback is intentional.

Manual acceptance checklist: open real assigned service; change From/To; make booking or hold/cancel; click **Copy**; verify pasted PNG in WhatsApp matches current segment, correct seat codes/colors, both decks, correct service/date, four labels and optional configured website; verify downloaded fallback with clipboard permission denied. Check that no customer name, phone, PNR or price appears in image. If the user expects exact pixel matching to the reference screenshot across device fonts/DPI, a side-by-side rendered-image UAT is still required.

No new npm dependency, provider integration, background process, booking change or unrelated schedule/CRM/Vehicles modification is introduced.
