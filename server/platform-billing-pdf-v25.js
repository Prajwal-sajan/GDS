'use strict';
// Seven platform-owned PDF templates mapped to the uploaded ST/MFS/CS/CHS/PSS/OS structures.
// Never use the reference issuer identity. All inputs must pass billing-source validation.
const {Pdf,portrait}=require('./report-suite-pdf-v21');
const Words=require('./indian-money-words-v25');
const m=x=>'INR '+Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=x=>Number(x||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const sections={
 tax:'TAX INVOICE',metro:'METRO FEEDER SERVICE STATEMENT',cloud:'CLOUD CALLS USAGE STATEMENT',
 ai:'AI VOICE CALLS USAGE STATEMENT',chat:'WHATSAPP, AI MESSAGES & SMS USAGE STATEMENT',
 platform:'PLATFORM SALES STATEMENT',operator:'STATEMENT OF ACCOUNT'
};
const c=(key,label,width,type)=>({key,label,width,type:type||'text'});
function metadata(pdf,info){
 const p=pdf.page,issuer=info.issuer,op=info.operator;
 p.text(pdf.size.W/2,17,issuer.legal_name,{size:13,bold:true,align:'center'});
 p.text(pdf.size.W/2,37,issuer.address,{size:8,align:'center'});
 p.text(pdf.size.W/2,50,'Email: '+issuer.email+' | Mobile: '+issuer.phone,{size:8,align:'center'});
 p.text(pdf.size.W/2,63,'GSTIN: '+issuer.gstin,{size:8.4,bold:true,align:'center'});
 p.rect(17,80,pdf.size.W-34,26,[.91,.91,.91]);p.rule(17,80,pdf.right,80);
 p.text(pdf.size.W/2,86,sections[info.type],{size:12,bold:true,align:'center'});
 p.rule(17,106,pdf.right,106);p.rule(17,108,17,182);p.rule(pdf.right,108,pdf.right,182);
 p.rule(pdf.size.W/2,108,pdf.size.W/2,182);
 p.text(25,113,info.type==='tax'?'Billing Address':'Statement for / Billing address',{size:8,bold:true});
 p.text(25,127,op.legal_name||op.operator_name,{size:8,bold:true});
 String(op.address||'').match(/.{1,58}/g)?.slice(0,3).forEach((line,i)=>p.text(25,140+i*10,line,{size:7.4}));
 p.text(25,174,'GSTIN: '+(op.gstin||'Not registered'),{size:7.5});
 const x=pdf.size.W/2+9;
 if(info.type==='tax'){
  p.text(x,113,'Shipping Address',{size:8,bold:true});
  p.text(x,127,op.legal_name||op.operator_name,{size:8,bold:true});
  String(op.shipping_address||op.address||'').match(/.{1,57}/g)?.slice(0,4).forEach((line,i)=>p.text(x,140+i*9,line,{size:7.3}));
  p.rule(17,184,pdf.right,184);
  const entries=[
   ['Invoice Number',info.number,'Place of Supply',String(info.snapshot?.place_of_supply||op.state||'')],
   ['Invoice Date',info.issue_date,'Created By','Platform Billing Service'],
   ['Due Date',info.snapshot?.invoice_meta?.due_date||'','Invoice Type','Tax Invoice']
  ];
  let y=185;const half=(pdf.size.W-34)/2;
  for(const [l,v,r,w] of entries){
   p.rule(17,y+18,pdf.right,y+18,.4);
   p.rule(17+half,y,17+half,y+18,.4);
   p.text(24,y+3,l+': '+v,{size:7.6,bold:l==='Invoice Number'});
   p.text(23+half,y+3,r+': '+w,{size:7.6});
   y+=18;
  }
  p.rule(17,185,17,y,.4);p.rule(pdf.right,185,pdf.right,y,.4);
  pdf.y=y+10;
 }else{
  p.text(x,113,'Document No.: '+info.number,{size:8,bold:true});
  p.text(x,130,'Statement Date: '+info.issue_date,{size:8});
  p.text(x,146,'Period: '+info.period_start+' to '+info.period_end,{size:8});
  p.text(x,162,'Operator ID: '+String(op.operator_id),{size:8});
  p.rule(17,184,pdf.right,184);
  pdf.y=196;
 }
}
const section=(pdf,title)=>{
 pdf.need(28);pdf.page.rect(17,pdf.y,pdf.size.W-34,20,[.94,.94,.94]);
 pdf.page.text(23,pdf.y+4,title,{size:9,bold:true});pdf.y+=25;
};
const note=(pdf,str,size=7.6)=>{
 const parts=String(str||'').match(/.{1,115}/g)||[''];
 pdf.need(parts.length*11+10);
 parts.forEach(x=>{pdf.page.text(21,pdf.y,x,{size});pdf.y+=11});pdf.y+=8;
};
const sum=(pdf,items)=>{
 section(pdf,'Summary');
 for(const [name,amount] of items){
  pdf.need(15);pdf.page.rule(19,pdf.y+14,pdf.right-2,pdf.y+14);
  pdf.page.text(24,pdf.y,name,{size:8.2,bold:/total|closing/i.test(name)});
  pdf.page.text(pdf.right-7,pdf.y,typeof amount==='number'?m(amount):String(amount),{size:8.2,bold:true,align:'right'});
  pdf.y+=17;
 }
 pdf.y+=8;
};
const table=(pdf,title,cols,rows,totals)=>{
 pdf.table({title,cols},rows||[],totals||{});
};
const footer=(pdf,issuer,words)=>{
 pdf.need(58);pdf.page.rule(18,pdf.y,pdf.right,pdf.y);
 note(pdf,words||'This document is generated from verified platform billing records.');
 pdf.page.text(pdf.size.W/2,pdf.y+6,'For '+issuer.legal_name,{size:8,bold:true,align:'center'});
 pdf.page.text(pdf.size.W/2,pdf.y+21,'Computer-generated document; signature not required.',{size:7.2,align:'center'});
 pdf.y+=40;
};
function generate(info){
 const {type,issuer,operator,snapshot:s}=info;
 if(!sections[type])throw Error('Unsupported billing PDF type');
 const pdf=new Pdf(portrait);pdf.documentStyle=true;
 metadata(pdf,info);
 const tot=s.totals||{};
 if(type==='tax'){
  note(pdf,'Billing period: '+info.period_start+' to '+info.period_end+'  |  Operator ID: '+operator.operator_id);
  table(pdf,'Service charges',
   [c('no','#',.55),c('description','Description / GST / SAC',5.0),c('rate','Rate',1.1),
    c('qty','Qty',.7),c('taxable','Taxable',1.2),c('total','Total',1.2)],
   s.line_items.map((r,i)=>({
    no:String(i+1),description:r.description+' | GST '+r.gst_rate+'% | SAC '+r.sac+(r.note?' | '+r.note:''),
    rate:num(r.rate),qty:r.qty,taxable:num(r.taxable),total:num(r.total)})));
  // The twelve-line reference has its financial summary and bank details on page two.
  if(s.line_items.length>=10)pdf.newPage();
  sum(pdf,[['Taxable',tot.taxable],...(tot.cgst?[['CGST',tot.cgst]]:[]),
   ...(tot.sgst?[['SGST',tot.sgst]]:[]),...(tot.igst?[['IGST',tot.igst]]:[]),['TOTAL',tot.total]]);
  note(pdf,'Total in words: '+Words.amount(tot.total));
  note(pdf,'This invoice is for platform services supplied to the bus operator. It does not include passenger fares; passenger transport is supplied by the operator.');
  section(pdf,'Bank details');
  note(pdf,'Bank Name: '+issuer.bank_name+'  |  Account Name: '+issuer.bank_account_name);
  note(pdf,'Account Number: '+issuer.bank_account_number+'  |  IFSC: '+issuer.bank_ifsc);
  footer(pdf,issuer,'Thank you for your business.');
 }else if(type==='metro'){
  note(pdf,'Metro feeder fares are recorded using issued ticket / link evidence; exempt agency amounts are separate from taxable Metro-Bus platform connection charges.');
  table(pdf,'Metro operator summary',
   [c('provider','Payable to (Metro Rail Operator)',3),c('city','City',1.25),c('billing_basis','Billing basis',2.5),
    c('pnrs','PNRs',.7),c('passengers','Passengers',.95),c('metro_fares','Metro Fares',1.3)],
   (s.summary_rows||[]).map(r=>({...r,metro_fares:m(r.metro_fares)})));
  sum(pdf,[['Total metro fares',tot.metro_fares]]);
  note(pdf,'Amount in words: '+Words.amount(tot.metro_fares));
  table(pdf,'Individual Metro feeder tickets',
   [c('date','Date',1.1),c('pnr','PNR',2),c('service','Service',1),c('metro','Metro',1.15),
    c('passenger_station','Passenger station',1.7),c('exchange_point','Exchange point',1.5),
    c('pax','Pax',.5),c('fare_per_pax','Fare/pax',.8),c('fare','Fare',.85)],
   (s.lines||[]).map(r=>({...r,fare_per_pax:num(r.fare_per_pax),fare:num(r.fare)})));
  footer(pdf,issuer,'The fare totals reconcile with the Metro settlement and operator ledger.');
 }else if(type==='cloud'||type==='ai'){
  note(pdf,'Chargeable provider usage. Each row is one answered call, not one billed-minute unit; see the charge summary for the rated amounts.');
  table(pdf,'Individual call records',
   [c('date','Date',1.1),c('time','Time',1.05),c('from','From',1.7),c('to','To',1.7),
    c('duration','Duration',1),c('charge','Charge',.8)],
   (s.lines||[]).map(r=>({...r,charge:num(r.charge)})));
  table(pdf,'Usage and tax summary',
   [c('label','Service',2.7),c('calls','Calls',1),c('charge','Charge',1.2),c('gst','GST 18%',1.2),c('total','Total',1.2)],
   (s.summary_rows||[]).map(r=>({...r,charge:num(r.charge),gst:num(r.gst),total:num(r.total)})));
  sum(pdf,[['Total including GST',tot.total]]);
  note(pdf,'Amount in words: '+Words.amount(tot.total));
  footer(pdf,issuer,'Usage statement only; GST on platform services is also reflected in the issued tax invoice.');
 }else if(type==='chat'){
  note(pdf,'Outgoing WhatsApp messages, AI replies and SMS charged by dated and verified message event; inbound messages and exempt conversations are excluded.');
  table(pdf,'Message charges',
   [c('label','Messages',3),c('count','Count',1.1),c('rate','Rate / message',1.3),c('amount','Amount',1.3)],
   (s.summary_rows||[]).map(r=>({...r,rate:num(r.rate),amount:num(r.amount)})));
  sum(pdf,[['Total before GST',tot.before_gst]]);
  note(pdf,'Amount in words: '+Words.amount(tot.before_gst));
  footer(pdf,issuer,'This usage statement is not a tax invoice; GST is charged on the separate platform tax invoice.');
 }else if(type==='platform'){
  note(pdf,'Platform sales by journey date, showing separately Website, Paytm and Offline Sales; excludes unrelated OTA ticket sales.');
  table(pdf,'Summary by sales channel',
   [c('label','Summary',3),c('website','Website',1.3),c('paytm','Paytm',1.3),
    c('offline_sales','Offline Sales',1.5),c('total','Total',1.3)],s.channel_summary||[]);
  table(pdf,'PNR-wise sales, commissions and cancellations',
   [c('travel_date','Travel date',1),c('booked_on','Booked on',.9),c('channel','Channel',1),
    c('pnr','PNR',1.7),c('status','Status',.9),c('sales','Sales',.85),c('offer','Offer',.75),
    c('net_fare','Net fare',.9),c('commission','Commission',.85),
    c('gst_on_commission','GST comm.',.8),c('cancellation_charge','Canc. charge',.75)],s.lines||[]);
  sum(pdf,[['Commission before GST',tot.total_commission],['Net to operator',tot.net_to_operator]]);
  note(pdf,'Total commission in words: '+Words.amount(tot.total_commission));
  footer(pdf,issuer,'Platform sales statement, not a supplier tax invoice.');
 }else{
  note(pdf,'Account: platform collections payable to the operator. Positive is payable to the operator; negative is payable by the operator.');
  sum(pdf,(s.summary_rows||[]).map(r=>[r.label,r.amount]).concat([['Posted closing balance',s.posted_closing_balance]]));
  if(Number(s.posted_closing_balance)>=0)note(pdf,'Closing balance in words: '+Words.amount(s.posted_closing_balance));
  table(pdf,'Posted transaction ledger',
   [c('date','Date',1),c('type','Type',1.1),c('particulars','Particulars',2.8),c('deducted','Deducted/Paid',1.1),
    c('collected','Collected',1.1),c('balance','Balance',1),c('reference','Reference',1.3)],s.ledger||[]);
  if(s.provisional_ledger?.length){
   table(pdf,'PROVISIONAL - not posted or settled',
    [c('date','Date',1),c('type','Type',1.1),c('particulars','Particulars',2.8),c('deducted','Deducted/Paid',1.1),
     c('collected','Collected',1.1),c('balance','Balance',1),c('reference','Reference',1.3)],s.provisional_ledger);
   sum(pdf,[['Provisional payable / receivable (not posted)',s.provisional_balance]]);
  }
  footer(pdf,issuer,'This statement of account is not a tax invoice. Please report discrepancies to our billing team.');
 }
 return pdf.file();
}
module.exports={generate};
