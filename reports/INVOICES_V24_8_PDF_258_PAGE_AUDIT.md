# Invoices v24 — eight-original-PDF / two-screen forensic feature audit

**Scope:** Accounts > Invoices; November Travels / SaveTrip examples dated October 2026 and November current-statement reference. Eight PDFs, **258 pages**, plus two screenshot crops. The PDFs were reviewed as **reference documents**, not as live billing data. Their passenger numbers, PNRs, banking details and client identifiers must never be copied into a publicly readable codebase, demo issuer, or unrelated operator ledger.

## Exact UI inventory (screenshots 1 and 2)

**Top navigation:** Sales | Transactions | Receivables | Reports | **Invoices** selected | OTA Invoice Verifier | Agent Settings | Loyalty.

**Balance panel:** rounded full-width white card; pale-wallet circle; uppercase OUTSTANDING BALANCE; two-decimal INR; source text "As per Operator Statement [number] for [month, year]" and inline **View**; right-side outlined **Refresh**, violet-blue **Pay**. The source screenshot displays ₹0.00, which is **not** a license to set zero when underlying records are missing.

**Filtering and current statement:** light gray rounded **All types** dropdown, **All years** dropdown; separate "Current statement" label/document icon followed by **View** pill and **PDF** download. The current statement can be provisional and has different logic from a closed monthly statement.

**Monthly groups:** descending heading OCTOBER 2026, SEPTEMBER 2026, etc.; rounded white group and slim gray borders; right-aligned **Download all**; each row has a bold document label, muted reference number, blue eye/View pill and PDF link. Seven document categories:
1. Tax Invoice
2. Metro Feeder Statement
3. Cloud Calling Statement
4. AI Calling Statement
5. Chat Statement
6. Platform Sales Statement
7. Operator Statement

**Nonreference additions necessary for working GDS:** "Add document" and "Import original PDF" for missing originals; "Reconcile" to expose source-backed cross-document checks; a restrictive payment-reference flow, since no bank gateway is connected. Keep these visually subordinate to the seven reference types and original actions.

## Eight PDFs: page-by-page structural inventory

### 1. ST-26-27-11.pdf — Tax Invoice (2 pages)

Portrait A4. Page 1 has supplier legal header, billing/shipping address columns, GSTIN and POS; invoice number/date/due date/place of supply/created-by/type; **12** line items, each with service description, **rate, quantity, taxable value, total inclusive of GST**, supporting date/commission note, GST rate and SAC. Includes distribution, auto pricing, Metro-Bus connection service, WhatsApp, SMS, AI messages, website ticket-commission, cloud calls, AI calls, telephone rental, Paytm commission, offline commission. Page 2 contains taxable, CGST, SGST, invoice grand total, amount in words, service-vs-passenger-fare disclaimer, beneficiary bank details, issuer footer and computer-generated note. **Do not use passenger fares as this invoice's taxable service value.** Invoice tax breakdown must derive from configured rate/SAC/place of supply and documented per-line amounts; no hardcoded example issuer or bank.

### 2. MFS-2026-00042.pdf — Metro Feeder (13 pages)

Portrait A4, supplier header, operator address/GST, statement number/date/period, **GST-exempt / pure-agent** declaration. First-page metro-operator summary columns: **Payable to (Metro Rail Operator), City, Billing basis, PNRs, Passengers, Metro Fares (₹)**. Separate BMRCL (Bengaluru published/QR fare) and L&T Hyderabad (published fare less operator discount) rules. Individual line columns throughout pages: **Date, PNR, Service, Metro, Passenger Station, Exchange Point, Pax, Fare/Pax, Fare (₹)**; date subtotals; closing metro-operator/total summary, notes and issuer footer. Counting billable sent tickets is **not** equivalent to counting all Metro-labelled bookings. Reconcile operator statement Metro deduction to total ticket fares, not to the taxable "Metro-Bus Connection Charges" line on the tax invoice.

### 3. CS-2026-00033.pdf — Cloud Calls Usage (62 pages)

Individual chargeable calls, portrait A4, first-page issuer/recipient/period header. **Date, Time, From, To, Duration, Charge (₹)** repeated across pages; terminal **Service, Calls, Charge, GST at 18%, Total** summary and separate **business-number rental**, including assigned days and prorated days. Calls are human/staff-facing connected sessions; unanswered calls not charged. Telephone lines are billed per started minute, including multiple lines where used. Chargeable call count is **not the same** as billed minute quantity. All original From/To numbers are sensitive and belong only in restricted document storage.

### 4. CS-2026-00034.pdf — AI Voice Calls (172 pages)

Same call-detail columns and print/header structure as Cloud Calling, with AI voice-session classification. Terminal summary includes **calls**, **pre-GST charges**, **18% GST**, **total**. AI call count and billable started-minute count must remain distinct. A call log without telephony-provider billing evidence must **not** generate an official usage statement.

### 5. CHS-2026-00035.pdf — WhatsApp / AI / SMS (1 page)

Issuer/recipient/period/services header. Exactly four summary columns: **Messages, Count, Rate / message (₹), Amount (₹)**; categories **Outgoing**, **AI replies**, **SMS**; **Total (before GST)**; amount in words; five explanatory notes and computer-generated issuer footer. Nonchargeable WhatsApp service conversations and passenger inbound messages are excluded. Each line uses date-effective rate cards; **these are pre-GST charges** included on the separate supplier tax invoice (not another tax invoice).

### 6. PSS-2026-00091.pdf — Platform Sales (4 pages)

Supplier/recipient/period **by travel dates**, monthly statement not tax invoice. First-page cross-channel summary columns **Summary, Website, Paytm, Offline Sales, Total**. All reference rows: **Tickets sold, Tickets cancelled, Total sales including GST, Less offers, Collected from passengers, Net fare excluding GST, GST on fare, Commission rate, Commission on tickets sold, Commission kept on cancelled tickets, Total commission before GST, GST on commission, TDS/TCS/GST 9(5), Cancellation charges kept, Refunded to passengers, Net to operator**.

Detail table on subsequent pages: **Travel date, Booked on, Channel, PNR, Status, Sales, Offer, Net fare, Commission, GST on commission, Cancellation charge**. Channel subtotals and grand totals follow. Website, Paytm and offline (agent/branch bookings paid online to platform) must remain separate; OTA sales from other platforms are not to be included. Cancellation commission, cancellation charges to operator and passenger refunds must use the source event history and agreed rate cards. The PSS "net to operator" is not necessarily identical to operator-ledger "posted platform sales" due to settlement definitions.

### 7. OS-2026-00132.pdf — Closed October Operator Statement (1 page)

Supplier/recipient statement metadata. First-page summary **Opening balance, Add platform sales, Less supplier invoices, Less Metro feeder charges, Less payouts, Closing balance (posted entries)**. Ledger columns **Date, Type, Particulars, Deducted / Paid (₹), Collected (₹), Balance (₹), Reference**; opening and posting rows, period totals, closing balance and notes.

**Signed convention:** positive = platform owes operator; negative = operator owes platform. A typed, reconciled running ledger is required before a document may influence operational payable balances. A newly uploaded PDF by itself must not silently post transactions.

### 8. OS-2026-00011.pdf — Current Statement of Account (3 pages)

Cumulative period from fiscal start to a November as-of date rather than just closed October. Summary includes posted opening/collections/invoices/Metro/payout/closing, then separately reported **provisional month-to-date Website, Paytm, Paytm charges, Offline, Offline charges, supplier invoice** and **provisional payable**; detailed running ledger through latest posted entries. Provisional entries must be visually labelled and cannot be treated as settled. PDF is not a tax invoice.

## Required cross-document validation

| Source / derived | Target | Mandatory check |
|---|---|---|
| Tax taxable + CGST + SGST/IGST | Tax grand total | Explicit tax reconciliation; per-SAC rates, place-of-supply evidence |
| Tax invoice total | Operator posted "Invoice" deductions | Equal when same issued period/posted cycle |
| Metro provider fares sum | Metro statement total | Operator-specific passenger/PNR/ticket-ledger reconciliation |
| Metro statement fare total | Operator posted "Metro" deduction | Exempt pure-agent deduction, separate from taxable connection service |
| Cloud connected-call charges and rental | Tax invoice Cloud Calling + Number Rental lines | Separate calls, billed minutes, rental days, pre-GST versus total |
| AI voice usage | Tax invoice AI Calling line | Billed line-minutes **not** number of calls |
| WhatsApp / AI replies / SMS | Corresponding tax invoice lines | Count × date-effective rate; amount before GST |
| PSS channel commissions | Tax invoice channel commission lines | Keep Website, Paytm and offline separately |
| PSS net to operator | Posted platform sales | **Never assume direct equality**; reconcile net settlement events |
| OS running balance | Posted closing balance | Opening + collected − deducted − payouts = closing, exact INR paise |

## Implementation mapping

- `server/invoices-v24.js`: typed catalogue, original-PDF SHA-256 verified private storage, version tracking, validated snapshots, signed balance, complete monthly ZIP, payment-UTR pending verification; separates reference material from live accounting.
- `server/api/invoices-v24.js`: protected documents/current/month bundle/view PDF/structured snapshot/payment/reconciliation routes.
- `server/invoice-reconcile-v24.js`: missing-vs-match-vs-mismatch cross-statement checks; never infers PDF content from filename or a provider summary alone.
- `public/js/invoices-v24.js`: screenshot-style grouped UI, filters, original-PDF preview, import, ZIP, current statement, payment reference dialog and cross-statement reconciliation.
- `public/css/invoices-v24.css`: white rounded cards, muted icons/text, blue/violet controls, grouped monthly rows and responsive/print CSS.
- `tests/check-invoices-v24.cjs`, `tests/invoices-v24-ui.cjs`: permissions, view/download byte identity, ZIP, type/period filters, operator credit/debit sign, reference isolation, typed snapshot validation, financial checks, component rendering and existing Reports regressions.

**Security:** Original customer/reference PDFs and phone numbers stay in the operator's private local `data/invoice-pdfs` directory, ignored by Git. These examples are neither copied into the public repository nor assumed to be issued by the GDS user. The billing engine does not issue tax invoices until issuer/company/SAC/rate details and source-backed billed events are established. An uploaded original PDF remains byte-for-byte identical rather than silently re-rendering or reconstructing it.

## Remaining live-integration prerequisites

The current GDS stores demonstration invoices and manually recorded call/chat events; its cloud calling and AI usage records are not verified billing-provider extracts, and Metro ticket provider settlement feeds are not established for live financial issuance. Accordingly, uploaded originals work end-to-end as **document management**, but automatically issuing **new authoritative** cloud/AI/WhatsApp/Metro/tax invoices still requires authenticated source billing events, a configured issuer/rate card, accounting approvals and operator-specific finance integration. These limitations cannot be closed honestly by copying numbers from screenshots.
