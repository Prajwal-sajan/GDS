# Invoices v25: platform-issued operator invoices (source and UI audit)

The Accounts > Invoices module is now READ-ONLY for the bus operator. The former Add document and Import PDF controls are removed. All types and All years use the exact shared G.niceSelect visual dropdown pattern. Issued statements are fetched automatically from the protected invoices-v25 API, not uploaded by bus operators.

## Source formats

Uploaded ST-26-27-11, MFS-2026-00042, CS-2026-00033, CS-2026-00034, CHS-2026-00035, PSS-2026-00091, OS-2026-00132 and OS-2026-00011 informed the own-issued document templates. They remain third-party references only. Do not copy the reference supplier's GSTIN, banking details, letterhead, customer PNRs or identity into our invoices.

1. TAX INVOICE: issuer/recipient address and GSTIN, invoice number/date/due date, place of supply, Description, Rate, Qty, Taxable, Total, line GST rate/SAC, taxable subtotal, CGST/SGST or IGST, total, bank details, amount due and issuer footer. Platform service fees only, not passenger fares.
2. METRO FEEDER: metro rail operator, city, billing basis, PNRs, passengers, Metro fares; ticket lines Date/PNR/Service/Metro/Passenger Station/Exchange Point/Pax/Fare per Pax/Fare. Pure-agent Metro fare is separate from platform connection charges.
3. CLOUD CALLING: individual answered calls Date/Time/From/To/Duration/Charge, call totals, GST and number-rental summary.
4. AI CALLING: individual AI calls Date/Time/From/To/Duration/Charge, billable-minute and call-count distinctions, GST summary.
5. CHAT: Outgoing/AI replies/SMS, chargeable count, per-message rate, pre-GST amount and total.
6. PLATFORM SALES: Website/Paytm/Offline Sales summary, PNR lines with travel date, booked date, channel, status, sales, offer, net fare, commission, GST and cancellation charge, totals.
7. OPERATOR STATEMENT: posted ledger Date/Type/Particulars/Deducted/Collected/Balance/Reference, signed opening/closing balance, separately identified provisional entries if supplied.

All PDF output uses configured OWN platform issuer and bus operator profiles. The A4 PDF generator provides full multipage tables, repeated table headings and sum sections. Rupee amounts are printed as INR for compatibility with built-in PDF fonts; this implementation follows the document organization but is not a claim of pixel-identical rendering.

## Platform-owned source and issuance contract

- POST /api/platform-billing/v25/configure requires x-billing-service-key header and a configured legal issuer (GSTIN, bank/account details) and one operator finance profile matched to the local tenant.
- POST /api/platform-billing/v25/source requires the same server-only key. Its body is a sealed, verified, provenance-backed snapshot with a type, month, operator_id, verified=true, locked=true, source_refs array and a typed snapshot.
- The backend invokes runDue on source arrival, at startup and every 15 minutes. It issues all seven documents only after the month is closed and every required source is complete and reconciled. All seven PDFs are generated before any is persisted.
- No original operator-facing create, import, PDF upload or snapshot edit route remains writable; legacy mutation routes return HTTP 405.
- The operator GET /api/accounts/invoices-v25 returns only signed, issued, platform-generated, nonreference documents belonging to the active tenant, and supplies type/year options for the standard dropdown.
- View / PDF / monthly ZIP / Current statement / Reconcile / Refresh and pending bank-UTR entry continue to work. A missing statement renders as unavailable, not a fabricated zero debt.

Idempotent issuance preserves document identity and fails on changes to locked original source snapshots. Operators cannot access the server billing service key.

## Important limits

This JavaScript GDS is currently a single-operator demonstration JSON store. Actual bus reservations, platform sales settlements, provider-rated cloud calling and AI calls, WhatsApp/SMS billing, tax-effective rate-card history, Metro ticket settlement feeds, and central multi-tenant billing services STILL NEED TO BE CONNECTED to the authorized platform source snapshots. No real tax invoice is issued from missing/demo data. Before production, implement PostgreSQL-backed atomic financial posting, double-entry settlement, issuer legal approvals, e-invoice/credit note compliance, and bus-operator tenant isolation. The internal source key is not an independently certified provider feed.

## Verification

Run:
  node tests/check-platform-billing-v25.cjs
  node tests/invoices-v25-ui.cjs
  node tests/check-reports-13-semantic-v23.cjs
  npm test

The GitHub Actions platform-invoices-v25 workflow runs backend, UI and Reports regressions and uses Poppler to render and inspect all seven example PDFs.
