'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../server/ota-reconciliation-v43');
const dir=path.join(__dirname,'..');
const src=p=>fs.readFileSync(path.join(dir,p),'utf8');
const pdf=[
'Payment Advice',
'Date: 02-07-26 Billing Period: From: 25-06-26 To: 01-07-26 Invoice No: 123456-000014',
'NOVEMBER TRAVELS GSTIN : 29AAICN5264C1ZD',
'Operator Code: 36337',
'PaymentMode: DOJ',
'Invoice Summary',
'Booking (a) 1,000.00',
'Cancellation (b) 50.00',
'Cancellation Charges (c)',
'20.00',
'Bus Cancellation (d) 40.00',
'Exceptional Refund (e)',
'5.00',
'Operator Offers (h) 60.00',
'TCS Deductions (l) 8.00',
'TDS 194-O (m) 2.00',
'Invoice Amount(Z) [a-b+c-d-e-h-l-m]',
'900.00 855.00'
].join('\n');
const rows=[
'29AAICN5264C1ZD-Payment',
'TIN PNR DOE DOM Route Seats TicketFare Commission AC GST NetPayable GDSCom Offer DiffGST',
'ST2606190040050',
'7BFRM55K   19/06   25/06 49208542 9U  1,049.00 129.56 52.45 948.56 0.00 52.45 0.00',
'49714',
'29AAICN5264C1ZD-Cancellation',
'ST2606202120460',
'TV7J11459812 22/06 26/06 49208655 7U 1,899.00 1,993.95 569.70 94.95 1,424.25',
'50404',
'29AAICN5264C1ZD-Bus Cancelled',
'ST2606161207550',
'TV7E34495127 25/06 16/06 49208540 4 600.00 78.00 30.00 537.96 0.00',
'48784',
'29AAICN5264C1ZD-Exceptional Refund',
'ST2606231753380',
'TV7N62564763 25/06 23/06 49208654 6U 950.00 851.77',
'51405'
].join('\n');
const parsed=engine.parsePaymentAdviceText([pdf,rows]);
assert.equal(parsed.invoice_number,'123456-000014');
assert.equal(parsed.operator_gstin,'29AAICN5264C1ZD');
assert.equal(parsed.payment_mode,'DOJ');
assert.equal(parsed.billing_period_start,'2026-06-25');
assert.equal(parsed.billing_period_end,'2026-07-01');
assert.equal(parsed.summary.bookings,1000);
assert.equal(parsed.summary.pax_cancel,50);
assert.equal(parsed.summary.cancellation_credit,20);
assert.equal(parsed.summary.invoice_amount,855);
assert.equal(parsed.computed_invoice_amount,855);
assert.equal(parsed.summary_delta,0);
assert.equal(parsed.rows.length,4);
assert.equal(parsed.statement_lines,3);
assert.equal(parsed.by_section.sold,1);
assert.equal(parsed.by_section.pax_cancelled,1);
assert.equal(parsed.by_section.bus_cancelled,1);
assert.equal(parsed.by_section.exceptional_refund,1);
assert.equal(parsed.rows[0].pnr,'ST260619004005049714');
assert.equal(parsed.rows[0].doj,'2026-06-25');
assert.equal(parsed.rows[0].commission,129.56);
assert.equal(parsed.rows[0].operator_offer,52.45);
assert.equal(parsed.rows[0].take_home,896.11);
const booking={id:1,pnr:parsed.rows[0].pnr,travel_date:'2026-06-25',source:'redbus',status:'confirmed',fare:{net:1049,total:1101.45,ota_commission:129.56,ota_commission_gst:23.32,operator_offer:52.45,ota_take_home:896.11}};
const results=engine.compareInvoice(parsed,[booking],{ota_slug:'redbus',commission_percent:12.35,gst_on_commission_percent:18,match_tolerance:1});
assert.equal(results.totals.verified,1);
assert.equal(results.rows[0].status,'matched');
assert.equal(results.rows[0].delta,0);
assert.equal(results.totals.missing_in_gds,3);
const missing=engine.compareInvoice(parsed,[booking,{id:2,pnr:'ST260626084500047777',source:'redbus',status:'confirmed',travel_date:'2026-06-27',fare:{net:900,total:945}}],{ota_slug:'redbus'});
assert.equal(missing.totals.missing_in_ota,1);
assert.equal(missing.rows.at(-1).status,'unmatched_gds');
const noEvidence=engine.compareInvoice(parsed,[{...booking,fare:{net:1049,total:1101.45}}],{ota_slug:'redbus',commission_percent:12.35});
assert.equal(noEvidence.totals.verified,0);
assert.notEqual(noEvidence.rows[0].status,'matched');

const nullEvidence=engine.compareInvoice(parsed,[{...booking,fare:{...booking.fare,ota_commission:null,ota_commission_gst:null,operator_offer:null,ota_take_home:null}}],{ota_slug:'redbus'});
assert.equal(nullEvidence.totals.verified,0,'Null fields cannot certify an invoice');
const duplicated=engine.parsePaymentAdviceText([pdf,rows+'\n'+[
 'ST2606190040050','7BFRM55K 19/06 25/06 49208542 9U 1,049.00 129.56 52.45 948.56 0.00 52.45 0.00','49714'
].join('\n')]);
assert.equal(duplicated.rows.filter(x=>x.pnr===booking.pnr).length,2,'Preserve duplicate PNR payment events');
assert.equal(new Set(duplicated.rows.map(x=>x.id)).size,duplicated.rows.length,'Stable unique event IDs');
const csv=engine.exportCsv({lines:results.rows});
const head=csv.replace(/^\ufeff/,'').split(/\r?\n/)[0].match(/"[^"]*"/g).map(x=>x.slice(1,-1));
assert.deepEqual(head,engine.EXPORT_HEADERS);
assert.equal(head.length,18);
assert(csv.includes('"ST260619004005049714"'));
assert(csv.includes('"Matched"'));
assert(!csv.includes('undefined'));

const reviewed=engine.exportCsv({lines:[{...results.rows[0],status:'mismatched',resolution:{action:'dispute',by:'Finance reviewer',note:'Commission evidence differs'}}]});
assert(reviewed.includes('"Mismatched"'),'Status must retain actual comparison outcome after review');
assert(reviewed.includes('"Finance reviewer"'),'Reviewer identity survives CSV export');
assert(reviewed.includes('Resolution: dispute'),'Review action survives in Notes');
assert(src('server/index.js').includes("require('./api/ota-reconciliation-v43')"));
assert(src('public/index.html').includes('/js/ota-reconciliation-v43.js?build=43'));
assert(src('public/index.html').includes('/css/ota-reconciliation-v43.css?build=43'));
const client=src('public/js/ota-reconciliation-v43.js');
const css=src('public/css/ota-reconciliation-v43.css');
new Function(client);
for(const key of ['invoice breakdown','Upload Invoice','Investigate','Dispute','Accept RedBus','Export CSV','Browse all','As Per GDS','As Per RedBus','PNR','TDS','TCS','Difference','cards','table','recheck','original'])assert(client.toLowerCase().includes(key.toLowerCase()),'missing UI '+key);
for(const key of ['ota43-ticket-check','ota43-ledger','ota43-revenue','ota43-payout','ota43-compare','ota43-ticket','ota43-browser-controls'])assert(css.includes(key),'missing style '+key);

assert(client.includes('invoiceFormulaItems'),'Full 23-category PDF formula is rendered');
assert(client.includes('gds_expected_fare')&&client.includes('payout_diff'),'Category summaries must display actual comparisons rather than fixed dashes');

const wrapped=engine.parseLineItems([
'29AAICN5264C1ZD-Payment\nST2606202306180 49208657 22,19,20,1\nTV7J92620628 20/06 25/06 4,145.00 458.02 207.25 3,811.79 0.00 621.75 0.00\n50450 8,21'
],2026);
assert.equal(wrapped.rows.length,1);
assert.equal(wrapped.rows[0].pnr,'ST260620230618050450');
assert.equal(wrapped.rows[0].fare,4145);
// PDF binary integration fixture uses only generic, non-operator content.
function tinyPdf(){
 const stream='BT /F1 17 Tf 52 690 Td (Payment Advice) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'
 ];
 let body='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(body));body+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n'}
 const start=Buffer.byteLength(body);
 body+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<offsets.length;i++)body+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 body+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
 return Buffer.from(body);
}
engine.extractPdf(tinyPdf()).then(pages=>{
 assert.equal(pages.length,1);
 assert(pages[0].includes('Payment Advice'),'pdfjs did not extract selectable text');
 console.log('PASS OTA v43 binary PDF.js extraction fixture');
}).catch(err=>{console.error(err);process.exitCode=1});

console.log('PASS OTA v43: split PNR, all 4 PDF sections, invoice formula, verified and unverified comparisons, 18-column CSV, complete UI/CSS wiring');
