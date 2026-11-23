# Schedule → Bookings → Pickup Charts v40 — screenshot and reference-PDF audit

## Reference sources inspected

The nine supplied SaveTrip screenshots cover import picker, expanded source choices, Pickup Chart popup, scrolling passenger grid, boarding and dropping details, Options form, City drop-down, RTO mode, and Windows native Share. The PDF references are distinct and must **not** be conflated:

- **"Schedule-Booking-print chart option on right side.pdf":** 4 pages, A4 landscape (841.89 × 595.28 pt), pickup-point-grouped chart. Header contains service/operator/route/vehicle/driver/date. Each stop gets count and optional feeder pickup annotation. Blue column headings: #, Seat, Mobile, PNR, Name, G, Trips, Drop, Fare, Source, Booked On. Two distinct final tables: Boarding Details (Station / Station Point / Seats / Seat Name) and Dropping Details (Station / Station Point / Seat Count / Seat Name). Real reference counts were 46 booked seats.
- **"Schedule-booking-print down- donwload.pdf":** 2 pages, A4 landscape, flat seat-number-ordered RTO output with header Service / Route / Date / Pickup / Drop / Vehicle / Driver / Printed. Blue column headings: #, Seat, Mobile, PNR, Name, G, Pickup, Drop. When "Trip start / end" is selected, the same first pickup / final drop appear on every row. "Passenger's own stop" uses each ticket's actual boarding/drop.
- Reference phone numbers, passenger names and PNRs are **not** committed as demo data. They only establish the column and layout contract. The generated PDFs query current authenticated GDS tickets or an explicitly stored external reference chart.

## 1. Import Pickup Chart (screenshots 1–2)

| Reference element | v40 implementation |
| --- | --- |
| Main white rounded modal over dimmed schedules | `pc40-import-dialog`, z-index 420, responsive sizing |
| Light-blue header band, file SVG, "Import pickup chart", blue "AUTO" pill | SVG and styled header |
| Service, route, travel date, departure time metadata chips | Derived from selected schedule (no literals) |
| Circular close X | Close/keyboard Escape, focus restoration |
| "Which GDS is this tripsheet from?" and sparkles icon | Exact label and inline SVG |
| Closed amber-bordered "Select your GDS" control | `pc40-source-selector` |
| Expanded blue list | Bitla TicketSimply; EzeeInfo; Infinity ITS; Detect automatically |
| Explanatory parser note | Rendered below select |
| Dashed large PDF upload box, cloud-upload SVG, Browse button | Drag/drop and file input; browse disabled until GDS chosen |
| 15MB limit, PDF file acceptance | Raw upload API enforces 15 MiB, accepts PDF and CSV |
| Preview and explicit import action | Extraction warnings, passenger grid, mismatched service/date blocks |
| Post-import view | Import saved as an external chart, can be selected in Print Chart; **never** overwrites confirmed bookings, inventory or ledger |

**Server parser limitations:** CSV with mapped headers runs with Node only. Searchable PDF extraction requires Poppler `pdftotext` on the GDS server (`GDS_PDFTOTEXT_PATH` can specify path on Windows). The supported names identify parser source conventions, but actual Bitla/EzeeInfo/Infinity PDF dialects beyond this supplied reference **cannot be certified** until representative vendor PDF samples are provided. No fake import success on scanned/unknown PDFs. Scanned PDFs do not get OCR.

## 2. Print Pickup Chart (screenshots 3–9)

- Modal: left green printer SVG, "Pickup Chart — [service]", operator subtitle; right Options, Print, Download, Share, Close with inline SVG icons and rounded pills.
- Print options: segmented Pickup chart / RTO chart, city select with `All passengers`, grouped Boarding at [city] (n) / Dropping at [city] (n).
- Per-column checks: Seat, Mobile, PNR, Name, Gender, Age, Contact Name, Trips, From City, To City, Pickup, Drop, Fare, Source, Booked On. Options remain scoped by chart mode. Default Pickup fields match the first PDF; RTO fields match second PDF.
- RTO: Pickup / Drop radio offers Trip start / end or Passenger's own stop; actual applied selection changes PDF data, not just UI.
- Preview: Service/Route/Vehicle/Driver/Date, capacity/Booked/Available, pickup groups and subgroup summaries; RTO uses one table. Scrollable interior and maintained header/options.
- PDF: operator data computed at request time from existing bookings; A4 landscape; blue header bands, striped cells, repeated table heading at page boundary, PDF built without extra packages.
- Print: retrieves **same** configured PDF and triggers browser printing through PDF iframe; certain browser PDF viewers require the user to press Print in the viewer.
- Download: saves configured PDF via Blob filename `pickup-chart-SERVICE-DATE[-RTO][-imported].pdf`.
- Share: shares same PDF File through Web Share API when available; otherwise securely downloads PDF for OS sharing. Windows Share sheet is platform/browser-provided, not custom simulated UI.

## Security/consistency

- Session authenticated and `bookings.view_all` required for row listing/export. Source imported requires `bookings.modify`.
- Bookings are filtered using existing booking scope policy, passenger phones are masked when phone-view permission is denied.
- Imports require explicit user confirmation. They are stored as separate external reference snapshots with original source, SHA-256 hash and audit trail.
- PDF exports have private, no-store headers and do not expose public links or third-party services.
- Source file is not retained: only validated parsed rows, hash, date, GDS source and operator audit are persisted.
- Imported external chart data is **not** treated as inventory truth; reconciliation must be independently authorized.

## v40 coverage tests

- `tests/pickup-chart-v40-api.cjs`: current-passenger scope; A4 PDF bytes; Pickup vs RTO layout; column filtering; city validation; PDF disposition; source import preview and one-use commit; mismatches and bad PDF rejection; data isolation.
- `tests/pickup-chart-v40-ui.cjs`: all icons, source dropbox, drag-drop box, selector choices, option defaults, field checkboxes, grouped vs flat preview, native sharing, PDF download and import-to-print flow.
- CI includes original v38 Schedule Bookings and v39 notification/loyalty plus regression suite.

## Production / browser UAT remaining

1. Verify pixel parity in Chrome at 1750×900 and narrower widths; screenshot parity is not fully established by jsdom.
2. Supply one permitted, redacted or synthetic tripsheet from each supported external GDS format for conclusive parser matching; current renderer has generic text-table parser with strict rejection.
3. Verify Windows Print interaction for Chrome/Edge PDF plugins and native Share API support; browser controls differ.
4. For multi-instance production storage, migrate import manifest and token flow off the existing JSON document store to transactional DB with retention/audit policy.

## v41 fidelity and workflow corrections — 23 November 2026

- **Pickup numbering:** The in-browser grouped chart now numbers passengers continuously across boarding groups instead of restarting at 1 per group. Tests confirm the first passenger of the second boarding section starts at 2 for a two-row test fixture.
- **Original ordering:** Generated grouped Pickup Chart PDF now retains passenger order inside each boarding point, as in the supplied four-page document (2U followed by 1U in the reference's first section). RTO continues sorting seats naturally, independent of original boarding order.
- **Board/drop summaries:** The on-screen station/city name appears once per consecutive group of stops, matching the original compact summary table.
- **City filtering:** The capacity, booked and available totals represent the full service even after a city is filtered. A separate `Showing` count identifies the filtered subset.
- **Import source dropdown:** Expanded source list supports Arrow Up/Down, Home, End, Enter/Space, and Escape-to-collapse; modal backdrop locks page scrolling and restores it on close.
- **PDF import metadata:** Distinguishes grouped pickup documents from RTO seat-ordered PDFs and warns that the RTO's trip-start/end columns can differ from actual passenger pickup/drop stops. Missing service/date provenance produces a warning.
- **Vendor detection:** Manually choosing Bitla, EzeeInfo or Infinity no longer falsely counts as independently detecting that vendor from the PDF. Both selected source and file-inferred identity are displayed separately; a file without detectable vendor markers remains unverified.
- **File handling:** Both supplied PDFs were inspected without copying real passenger phone numbers, names or ticket references into source or tests. Local Poppler text extraction identified 46 passenger rows in each; production import still requires the user to select and upload the appropriate permitted document.
- **Testing:** Added grouped/seat-order PDF comparison with synthetic source rows and expanded dropdown and scroll-lock browser-DOM regression checks. Automated CI remains the merge gate; a real Chrome visual pass and vendor-specific samples are still required for certification.
