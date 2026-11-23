# Accounts → OTA Invoice Verifier · v43 Screenshot Audit

Reference inputs: ten user-supplied screenshots; **redbus sample invoice.pdf** (19-page redBus Payment Advice, November Travels, period 25 Jun 2026–01 Jul 2026); **reconciliation_redbus_all_2026-11-22-export to CSV.csv** (18-column sample export, 200 data rows including repeated PNRs).

The original payment advice and actual PNR list are **not committed to this public repository**. Operators upload the PDF using the authenticated UI. This audit describes implementation coverage, not pixel-perfect browser approval.

| Screenshot | Reference workflow/details | Implemented location |
|---|---|---|
| 1 — Uploaded Invoices | Accounts tabs, Settlement Ledger heading, LIVE marker, upload CTA, RedBus identity, invoice number/date range, PNR total, match rate/issues, source filename, uploaded timestamp, View, Delete | `public/js/ota-reconciliation-v43.js`: `ledger`, `uploadDialog`; CSS `ota43-ledger` |
| 2 — Reconciliation Dashboard | Invoice identification, redBus payout hero and verification ring, Travelling/Pax cancellation/Operator cancellation summary, GDS and RedBus comparison | `detailPanel`, `summaryTable`; ledger-backed totals |
| 3 — Summary continuation | Fare and payout difference totals, contextual reconciliation notes, ticket check totals and issue filters | `summaryTable`, `detailPanel`, `section_stats` |
| 4 — Ticket check | All differences; missing on invoice; status, fare, offer, commission, cancellation-charge, payout differences; PNR list; CSV | `detailPanel`, `filterLineRows`, `tableRows`, export endpoint |
| 5 — Ticket review CTA | Ticket review banner, Invoice breakdown expand/collapse and Browse-all-tickets navigation | `detailPanel`, `pricing`, `browse` |
| 6 — Invoice breakdown | Invoice amount breakdown, revenue earned, booking count, cancellation retention/reversal, invoice source totals | `pricing` plus all 23 (a–w) formula categories |
| 7 — Net payout | Large blue net-payout card with stated payment advice amount | `pricing` / `ota43-payout` |
| 8 — Browse tickets | Back, count pills, matched/mismatched/missing/disputed filters, PNR search, Cards/Table switch, Export CSV, multicolumn header | `filters`, `render`, `loadLines`, `tableRows` |
| 9 — Compare table | GDS expected vs RedBus invoice fields, DOI/DOJ, fare, tax, passenger paid, commission, commission GST, offers, take-home, differences, action | `tableRows`; horizontally scrollable `ota43-compare` |
| 10 — Card view | Detailed PNR cards, mismatch / actual impact / reason, Accept RedBus, Dispute and Investigate | `rowCards`, `inspect`, `resolveDialog` |

## Extracted payment advice rules
- Source PDF is a redBus payment **advice**, not a GST tax invoice.
- Invoice has three ticket sections (**Payment**, **Cancellation**, **Bus Cancelled**) and a separate **Exceptional Refund** adjustment section. The reference document contains 819, 22, 23 and 2 respectively from direct independent PDF inspection: 864 ticket events plus 2 exceptional adjustments. The simulator must not treat the 2 exceptional adjustments as ordinary bookings.
- Invoice summary has the full formula (a–w); amounts are stated separately from GDS inferred values.
- PNR matching requires GDS evidence; absence means Missing in GDS or Needs review, not automatically Matched.
- Multiple records can share a PNR (cancellation / reversal / booking events). The implementation preserves separate events with stable per-section occurrence IDs.
- No reconciliation is silently posted to payments. Accept/Dispute/Investigating records a reviewer action, user, time and note.
- GSTIN conflict prevents certification of any match against a different operator GDS; original source PDFs stay on the authenticated server's private storage path.

## Export contract
The **Export CSV** action produces a UTF-8 BOM CSV with the exact 18 headers and order of the supplied sample:

`PNR, DOJ (SaveTrip), DOJ (OTA), Fare (SaveTrip), Fare (OTA), Operator Offer (OTA), Tax (SaveTrip), Tax (OTA), Commission (OTA), Tax on Commission (OTA), TDS (OTA), TCS (OTA), Payable (SaveTrip), Take-home (OTA), Take-home Diff, Status, Resolved By, Notes`.

Rows preserve duplicate PNR events, ISO date-time formatting and two decimal places. TDS/TCS and other per-PNR fields absent from source evidence remain **blank** rather than allocated from invoice-level totals.

## Verification
`node tests/ota-reconciliation-v43.test.cjs` and the GitHub workflow `v43 OTA Invoice Verifier PDF and PNR Reconciliation` cover parse fixtures, PNR joining and duplication, cancellation sections, total formula, evidence gating, export shape, null safeguards, UI routing and existing account regressions.

### Manual production acceptance still needed
1. Import the private **real 19-page** payment advice in a running GDS and confirm 819 Payment, 22 Pax cancellations, 23 Bus cancellations and 2 exceptional adjustments, 864 ticket events, invoice amount ₹9,83,590.66.
2. Compare every extracted PNR, fare, commission, GST, operator offer and cancellation amount with the source PDF (not just sample totals); test a second PDF with different layout.
3. Use a GDS with genuine same-operator historical booking records before expecting matches or treating any monetary difference as validated.
4. Compare the ten screens at the source browser resolution and test long horizontal comparison tables, responsive behavior, keyboard focus and all modals.
5. Validate date, monetary and reviewer-field CSV output in Excel and reconciliation systems before deployment.
