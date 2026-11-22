# Invoices v24 — private source-reference import

The private archive `Invoices_v24_Private_Reference_Import_Package.zip` is delivered to the operator via the ChatGPT conversation, **not** hosted in GitHub. It contains eight ORIGINAL PDFs, typed snapshot JSON for every PDF, a manifest and checksums. The source includes private PNRs, phone numbers, financial settlement amounts and a supplier bank account. Do not commit or upload it publicly.

## One-time import into a LOCAL, finance-restricted GDS

1. Pull the `savetrip-screenshotcomplete` GDS branch containing invoices v24. Use the real checked-out repository (`C:\JourneyOS\GDS-Savetrip-v23` when cloned as recommended), not the empty/outdated `C:\JourneyOS\GDS-Dev` directory.
2. From PowerShell, unzip the downloaded private package:
   ```powershell
   Expand-Archive -Path "$env:USERPROFILE\Downloads\Invoices_v24_Private_Reference_Import_Package.zip" `
      -DestinationPath "C:\JourneyOS\Invoice-References-v24" -Force
   ```
3. Install with `npm ci` in GDS root and start the server using `npm start`. Log in as an owner or accountant with Accounts Ledger access.
4. Keep the GDS login token private. The importer prompts for it as a hidden PowerShell input; it is not written to disk or placed on the command line. You can inspect your local browser's `localStorage` while logged into `localhost:3000`, but never share this token in chat.
5. In another PowerShell terminal:
   ```powershell
   cd C:\JourneyOS\GDS-Savetrip-v23
   .\tools\Import-Invoice-References-v24.ps1 `
     -ReferenceDirectory C:\JourneyOS\Invoice-References-v24 `
     -PdfDirectory C:\JourneyOS\Invoice-References-v24
   ```
6. Open **Accounts → Invoices**. Filter October 2026 to find the seven finalized documents, or view the November reference "Current statement". View and PDF download the verified originals; **Download all** returns complete ZIP only when all PDFs for a month are present. **Reconcile** compares the typed data and flags discrepancies. The private source material is stored in ignored `data/invoice-pdfs` and `data/db.json`, not in code.

The original source PDFs are preserved byte-for-byte and checked against the SHA256 hashes in the manifest before import. Import is always **reference-only**: these are third-party issuer documents, not live GDS-issued invoices; they cannot change an operator's payable balance, tax invoice records or payment settlement. To create a real operational statement, enter independently verified source records and a reconciled ledger using your own legal issuer and rate-card configuration.

## Eight source PDFs / mapped structures

| Document | Full source PDF | Typed fields |
|---|---:|---|
| Chat / WhatsApp–AI–SMS | 1 page | Three message service/rate/quantity/amount rows, before-GST total, notes |
| Cloud Calling | 62 pages | 2,611 call rows of date/time/from/to/duration/charge, usage/rental summary |
| AI Calling | 172 pages | 7,359 call rows, usage summary, one missing destination left null |
| Metro Feeder | 13 pages | 444 ticket rows (PNR, metro, station, exchange, pax, fare/pax, fare), two rail operator summaries |
| Tax Invoice | 2 pages | 12 service items, GST/SAC/rate/quantity, addresses, metadata, bank and all taxes |
| Platform Sales | 4 pages | 16 cross-channel summary rows, 101 PNR detail rows, commissions/refunds/GST/cancellations |
| Closed Operator Statement | 1 page | Opening, five journal rows, credit/debit/balance/reference, closing |
| Current Operator Statement | 3 pages | Cumulative 18 posted journal rows, six separate provisional journal rows, dual posted/provisional balance |

### Known source-document exception

The supplied Platform Sales PDF's detailed PNR cancellation-charge cells sum to **₹11,716.00**, whereas its period summary says **₹12,416.83**. Several cells are visually clipped in the PDF; the importer preserves the printed values and the difference of **₹700.83** remains a flagged mismatch rather than a fabricated repair. The original AI calling statement has one record with no reliably extractable destination number; this is left blank.

### Operational gaps outside screenshot parity

The system now supports exact original PDF storage and retrieval, typed source import, privacy-controlled search and month downloads, seven category UI, reference/current viewing and cross-statement reconciliation. It **does not** generate a newly issued legal invoice or start a bank transfer. Real invoicing needs authorized telephony/AI/SMS and Metro billing records, a configurable issuer, GST/SAC/rate cards, payment authorization, journal approvals and a production-grade transactional storage service. No original provider PDF is reconstructed from synthetic examples.
