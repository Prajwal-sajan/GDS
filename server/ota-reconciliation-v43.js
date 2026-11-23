'use strict';
// redBus Payment Advice extraction and evidence-grounded comparison. No synthetic "matched" statuses.
const crypto=require('node:crypto');
const U=require('./util');
const money=n=>Math.round((Number(n)||0)*100)/100;
const num=s=>{const v=Number(String(s??'').replace(/[₹,\s]/g,''));return Number.isFinite(v)?v:null};
const M=/-?\d[\d,]*\.\d{2}/g;
const values=s=>(String(s||'').match(M)||[]).map(num);
const DATES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const parseDate=(s,year)=>{const m=String(s||'').match(/^(\d{2})[-/](\d{2})(?:[-/](\d{2,4}))?$/);if(!m)return null;const y=m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):year;if(!y||+m[1]>31||+m[2]>12)return null;return y+'-'+m[2]+'-'+m[1]};
const key=s=>String(s||'').trim().toUpperCase().replace(/\s+/g,'');
const SUMMARY=[
 ['bookings','Booking (a)'],['pax_cancel','Cancellation (b)'],['cancellation_credit','Cancellation Charges (c)'],
 ['operator_cancel','Bus Cancellation (d)'],['exception_refund','Exceptional Refund (e)'],
 ['dynamic_pricing','Dynamic Pricing (f)'],['ads','Ad.s Deduction (g)'],['operator_offers','Operator Offers (h)'],
 ['partner_commission','SS partner commission'],['yourbus','YourBus Charge'],['gds_commission','Gds Commission'],
 ['tcs','TCS Deductions (l)'],['tds','TDS 194-O (m)'],['reschedule','Reschedule Charges (n)'],
 ['reschedule_excess','Reschedule Excess Fare'],['differential_gst','DifferentialGST (p)'],
 ['open_ticket_offers','Offers-Open Ticket (q)'],['generic_addon','Generic Add On(r)'],
 ['rise','Rise Program (s)'],['srp','SRP (t)'],['sponsored','Sponsored Listing (u)'],
 ['nova','Nova (v)'],['bo_rewards','BO Offer Rewards (w)'],['invoice_amount','Invoice Amount(Z)']
];
// pdfjs preserves glyph positions. Rebuild horizontal lines in the PDF viewport (handles rotated payment advice).
function positionedLines(items,viewport,util){
 const cells=[];
 for(const item of items){
  const t=util.transform(viewport.transform,item.transform);
  const raw=String(item.str||'').trim();
  if(!raw)continue;
  cells.push({x:t[4],y:t[5],s:raw,w:item.width||raw.length*6});
 }
 cells.sort((a,b)=>a.y-b.y||a.x-b.x);
 const lines=[];
 for(const item of cells){
  const prev=lines[lines.length-1];
  if(prev&&Math.abs(item.y-prev.y)<=3.5)prev.cells.push(item);
  else lines.push({y:item.y,cells:[item]});
 }
 return lines.map(l=>{
  l.cells.sort((a,b)=>a.x-b.x);
  let line='',right=-Infinity;
  for(const item of l.cells){
   if(line){const gap=item.x-right;if(gap>1.5)line+=' '.repeat(gap>26?3:1);}
   line+=item.s;
   right=Math.max(right,item.x+item.w);
  }
  return line.trim();
 }).filter(Boolean);
}
async function extractPdf(buffer){
 let pdfjs;
 try{pdfjs=require('pdfjs-dist/legacy/build/pdf.js')}catch(e){throw new Error('PDF support is not installed: npm install (pdfjs-dist) is required')}
 const data=new Uint8Array(buffer);
 const document=await pdfjs.getDocument({data,disableFontFace:true,useSystemFonts:true}).promise;
 if(document.numPages>200)throw new Error('PDF exceeds the 200-page safety limit');
 const pages=[];
 try{
  for(let i=1;i<=document.numPages;i++){
   const page=await document.getPage(i);
   const viewport=page.getViewport({scale:1,rotation:page.rotate||0});
   const content=await page.getTextContent({includeMarkedContent:false});
   pages.push(positionedLines(content.items,viewport,pdfjs.Util).join('\n'));
   page.cleanup();
  }
 }finally{await document.destroy()}
 return pages;
}
const sectionHeader=/[0-9A-Z]{8,20}\s*-\s*(Payment|Cancellation|Bus Cancelled|Exceptional Refund)/i;
const sectionKind=s=>({payment:'sold',cancellation:'pax_cancelled','bus cancelled':'bus_cancelled','exceptional refund':'exceptional_refund'})[String(s).toLowerCase()]||null;
function summaryValue(lines,startIndex){
 const direct=values(lines[startIndex]||'');
 if(direct.length)return direct[direct.length-1];
 for(let i=startIndex+1;i<=startIndex+3;i++){
  const next=String(lines[i]||'');
  if(/^(?:Booking|Cancellation \(|Bus Cancellation|Operator Offers|TDS|TCS|Dynamic Pricing|Invoice Amount|PaymentMode|Ad.s Deduction|SS partner)/i.test(next.trim()))break;
  const found=values(next);
  if(found.length)return found[found.length-1];
 }
 return null;
}
function parseSummary(text){
 const lines=String(text||'').split(/\r?\n/);
 const flat=lines.join(' ');
 const header={operator_name:null,operator_code:null,operator_gstin:null,invoice_number:null,billing_period_start:null,billing_period_end:null,issue_date:null,payment_mode:null,summary:{}};
 header.operator_code=(flat.match(/Operator\s*Code\s*:\s*(\d+)/i)||[])[1]||null;
 header.operator_gstin=(flat.match(/GSTIN\s*:\s*([0-9A-Z]{15})/i)||[])[1]||null;
 header.invoice_number=(flat.match(/Invoice\s*No\s*:\s*([0-9-]{8,})/i)||[])[1]||null;
 header.payment_mode=(flat.match(/Payment\s*Mode\s*:\s*([A-Z]{2,8})/i)||[])[1]||null;
 const period=flat.match(/Billing\s*Period\s*:\s*From\s*:\s*(\d{2}[-/]\d{2}[-/]\d{2,4})\s*To\s*:\s*(\d{2}[-/]\d{2}[-/]\d{2,4})/i);
 if(period){header.billing_period_start=parseDate(period[1]);header.billing_period_end=parseDate(period[2])}
 const issue=flat.match(/Date\s*:\s*(\d{2}[-/]\d{2}[-/]\d{2,4})/i);
 if(issue)header.issue_date=parseDate(issue[1]);
 const idx=lines.findIndex(x=>/Invoice Summary/i.test(x));
 const head=lines.slice(0,idx>=0?idx:20).join(' ');
 const op=(head.match(/\b([A-Z][A-Z ]{3,55}(?:TRAVELS|TRANSPORT|LINES))\b/)||[])[1];
 header.operator_name=op?.trim()||null;
 header.summary_details={};
 for(const [name,find] of SUMMARY){
  const at=lines.findIndex(x=>x.toLowerCase().includes(find.toLowerCase()));
  if(at>=0){
   header.summary[name]=summaryValue(lines,at);
   const columns=values(lines[at]);
   if(['bookings','pax_cancel','operator_cancel'].includes(name)&&columns.length>=7){
    header.summary_details[name]={ticket_fare:columns[0],commission:columns[1],cgst_commission:columns[2],sgst_commission:columns[3],igst_commission:columns[4],ac_service_tax:columns[5],net_settlement:columns[6],gross:money(columns[0]+columns[5])};
   }
  }
 }
 // The Z row wraps; use the last numeric value from the formula row before the footer.
 const zAt=lines.findIndex(x=>/Invoice Amount\(Z\)/i.test(x));
 if(zAt>=0){
  const zVals=values(lines.slice(zAt,zAt+5).join(' '));
  if(zVals.length)header.summary.invoice_amount=zVals[zVals.length-1];
 }
 return header;
}
function parseLineItems(pages,year){
 let section=null,rows=[],sectionsFound=new Set(),idx=0;
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
  const lines=String(pages[pageIndex]||'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
   const heading=lines[i].match(sectionHeader);
   if(heading){section=sectionKind(heading[1]);sectionsFound.add(section);continue}
   if(!section)continue;
   // Payment advice often splits a 20-character PNR after 15 characters, even across lines.
   const candidates=[...lines[i].matchAll(/ST\d{12,18}/gi)];
   for(const candidate of candidates){
    let pnr=key(candidate[0]);
    let suffix='';
    const nearby=lines.slice(i+1,i+4);
    if(pnr.length<20){
     for(const continuation of nearby){
      // The continuation is typically a 5-digit token in the same PNR column.
      const first=(continuation.match(/^\s*(\d{4,6})(?:\s+.*)?$/)||[])[1];
      if(first&&first.length+pnr.length===20){suffix=first;break}
     }
    }
    pnr+=suffix;
    // Scan the current and two following lines: dates and route may be on the next line.
    const nearbyText=[lines[i],...nearby].join(' ');
    const rowMatch=nearbyText.match(/(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(\d{7,10})\s+([\s\S]*?)(?=ST\d{12,18}|$)/i);
    let doe=null,doj=null,route=null,seatInfo='',prices=[];
    if(rowMatch){
      doe=rowMatch[1];doj=rowMatch[2];route=rowMatch[3];
      const moneyStart=rowMatch[4].search(M);
      if(moneyStart>=0){seatInfo=rowMatch[4].slice(0,moneyStart).trim();prices=values(rowMatch[4].slice(moneyStart))}
    }
    if(!prices.length){
      // Large multi-seat PNRs wrap the route/seat column ABOVE their dates.
      // Example: "ST... 49208542 22,19..." then "20/06 25/06 4,145.00..."
      const dates=nearbyText.match(/(\d{2}\/\d{2})\s+(\d{2}\/\d{2})/);
      const firstLine=lines[i].slice(candidate.index+candidate[0].length);
      const code=firstLine.match(/\b(\d{7,10})\b/);
      if(!dates||!code)continue;
      doe=dates[1];doj=dates[2];route=code[1];
      const seatStart=firstLine.slice(code.index+code[0].length).trim();
      const afterDate=nearbyText.slice(nearbyText.indexOf(dates[0])+dates[0].length);
      const start=afterDate.search(M);
      if(start<0)continue;
      seatInfo=(seatStart+' '+afterDate.slice(0,start)).trim();
      prices=values(afterDate.slice(start).split(/ST\d{12,18}/i)[0]);
    }
    if(!prices.length||!route)continue;
    const base={id:'event-'+(++idx),pnr,section,page:pageIndex+1,
     doe:parseDate(doe,year),doj:parseDate(doj,year),route_code:route,
     seats:seatInfo.replace(/\s+/g,' ').slice(0,110),fare:prices[0],raw_amounts:prices};
    if(section==='sold'){
     [base.fare,base.commission,base.tax,base.net_payable,base.gds_commission,base.operator_offer,base.differential_gst]=prices;
     base.take_home=money((base.net_payable??0)-(base.operator_offer??0)-(base.gds_commission??0));
     base.commission_tax=base.commission!==null?money(base.commission*.18):null;
    }else if(section==='pax_cancelled'){
     [base.fare,base.reversal,base.cancellation_charge,base.tax,base.net_reversed]=prices;
     base.take_home=money(base.cancellation_charge||0);
    }else if(section==='bus_cancelled'){
     [base.fare,base.commission,base.tax,base.net_reversed,base.other_adjustment]=prices;
     base.take_home=-money(base.net_reversed);
    }else if(section==='exceptional_refund'){
     [base.fare,base.refund_amount]=prices;
     base.take_home=-money(base.refund_amount);
    }
    rows.push(base);
   }
  }
 }
 return {rows,sections:[...sectionsFound]};
}

function invoiceFormula(s){
 const v=x=>Number(s[x])||0;
 return money(v('bookings')-v('pax_cancel')+v('cancellation_credit')-v('operator_cancel')-v('exception_refund')-v('dynamic_pricing')-v('ads')-v('operator_offers')-v('partner_commission')-v('yourbus')-v('gds_commission')-v('tcs')-v('tds')+v('reschedule')+v('reschedule_excess')+v('differential_gst')-v('open_ticket_offers')+v('generic_addon')-v('rise')-v('srp')-v('sponsored')-v('nova')-v('bo_rewards'));
}

function parsePaymentAdviceText(pages){
 if(!Array.isArray(pages)||!pages.length)throw new Error('PDF has no selectable text');
 const header=parseSummary(pages[0]);
 if(!header.invoice_number||!header.operator_code)throw new Error('Not a recognized redBus Payment Advice PDF: invoice number/operator code missing');
 const year=+(header.billing_period_start||header.issue_date||'').slice(0,4)||new Date().getFullYear();
 const {rows,sections}=parseLineItems(pages,year);
 if(!rows.length)throw new Error('No PNR payment/cancellation rows found in the document');
 const seen=new Set();for(const r of rows){const k=r.section+':'+r.pnr;r.id=k+':'+(seen.has(k)?r.id:'1');seen.add(k)}
 const bySection=Object.fromEntries(['sold','pax_cancelled','bus_cancelled','exceptional_refund'].map(s=>[s,rows.filter(x=>x.section===s).length]));
 const uniquePNRs=new Set(rows.map(x=>x.pnr)).size;
 const warnings=[];
 if(!rows.every(x=>/^ST\d{18}$/i.test(x.pnr)))warnings.push('Some invoice PNRs are split or malformed; review source rows');
 if(header.summary.invoice_amount==null)warnings.push('Invoice payout total could not be parsed');
 const calc=invoiceFormula(header.summary);
 if(header.summary.invoice_amount!=null&&Math.abs(calc-header.summary.invoice_amount)>0.05)warnings.push('Invoice summary formula does not equal stated net payout: check document parse');
 if(rows.some(x=>!x.doj||!x.fare))warnings.push('Some rows have incomplete date or amount fields');
 const gross=money(['bookings','pax_cancel','operator_cancel'].reduce((acc,k)=>acc+(header.summary_details[k]?.gross||0),0));
 return {...header,rows,sections,by_section:bySection,unique_pnrs:uniquePNRs,statement_lines:rows.filter(x=>x.section!=='exceptional_refund').length,statement_gross_fare:gross,computed_invoice_amount:calc,summary_delta:header.summary.invoice_amount==null?null:money(header.summary.invoice_amount-calc),parse_warnings:warnings};
}
const DAY=1000*60*60*24;
function compareInvoice(parsed,bookings,config={}){
 const tolerance=Number.isFinite(+config.match_tolerance)?+config.match_tolerance:1;
 const source=String(config.ota_slug||'redbus').toLowerCase();
 const byPNR=new Map();
 for(const b of bookings){for(const id of [b.pnr,b.ticket_number])if(id)byPNR.set(key(id),b)}
 const rows=parsed.rows.map(entry=>{
  const b=byPNR.get(key(entry.pnr));
  const flags=[],evidence={};
  if(!b){flags.push('missing_in_gds');return {...entry,status:'unmatched_ota',booking_status:null,differences:flags,verified:false,expected:null,delta:null,why:'PNR not found in GDS'};}
  const status=String(b.status||'').toLowerCase();
  const oursCancelled=['cancelled','refunded'].includes(status);
  const invCancelled=entry.section==='pax_cancelled'||entry.section==='bus_cancelled';
  if(invCancelled!==oursCancelled)flags.push('status');
  if(b.source&&String(b.source).toLowerCase()!==source)flags.push('channel');
  if(entry.section==='pax_cancelled'&&b.cancellation_charge!=null&&entry.cancellation_charge!=null&&Math.abs(Number(b.cancellation_charge)-entry.cancellation_charge)>tolerance)flags.push('cancellation_charge');
  if(b.travel_date&&entry.doj&&b.travel_date.slice(0,10)!==entry.doj)flags.push('doj');
  const fare=(b.fare||{}),expectedFare=Number(fare.net??fare.total);
  if(Number.isFinite(expectedFare)&&Math.abs(expectedFare-entry.fare)>tolerance)flags.push('fare');
  // A GDS booking must carry actual commission/tax/offer evidence for exact settlement proof;
  // the OTA config is a comparison estimate only, not a verified source of truth.
  const commissionBase=Number(fare.net??fare.base??0);
  const commission=Number(fare.ota_commission??(commissionBase*(Number(config.commission_percent)||0)/100));
  const commissionTax=Number(fare.ota_commission_gst??commission*(Number(config.gst_on_commission_percent??18)/100));
  const operatorOffer=Number(fare.operator_offer??0);
  const tax=Number(fare.gst??Math.max(0,Number(fare.total??0)-Number(fare.net??0)));
  const hasActual=Number.isFinite(Number(fare.ota_commission))&&Number.isFinite(Number(fare.ota_commission_gst))&&fare.operator_offer!==undefined;
  const ourPay=Number(fare.ota_take_home??(Number(fare.total??0)-commission-commissionTax-operatorOffer));
  const diff=entry.take_home==null?null:money(entry.take_home-ourPay);
  if(entry.commission!=null&&Math.abs(entry.commission-commission)>tolerance)flags.push('commission');
  if(entry.commission_tax!=null&&Math.abs(entry.commission_tax-commissionTax)>tolerance)flags.push('commission_tax');
  if(entry.operator_offer!=null&&Math.abs(entry.operator_offer-operatorOffer)>tolerance)flags.push('offer');
  if(entry.take_home!=null&&Math.abs(diff)>tolerance)flags.push('payout');
  const verified=hasActual&&flags.length===0&&(entry.section==='sold')&&status==='confirmed'&&(!b.source||String(b.source).toLowerCase()===source);
  return {...entry,booking_status:b.status,source:b.source,expected:{doj:b.travel_date||'',fare:money(expectedFare),tax:money(tax),commission:money(commission),commission_tax:money(commissionTax),operator_offer:money(operatorOffer),take_home:money(ourPay)},
   delta:diff,differences:[...new Set(flags)],status:flags.length?'mismatched':verified?'matched':'needs_review',verified,why:flags.join(', ')||(!hasActual?'GDS commission/tax/offer evidence incomplete':'Verified')};
 });
 // Missing-in-OTA is assessed only among redBus-origin bookings in this invoice's travel period.
 const invoicePNRs=new Set(parsed.rows.map(x=>key(x.pnr)));
 for(const b of bookings){
  const d=String(b.travel_date||'').slice(0,10);
  if(String(b.source||'').toLowerCase()!==source||!d||d<parsed.billing_period_start||d>parsed.billing_period_end||invoicePNRs.has(key(b.pnr)))continue;
  rows.push({id:'missing-'+b.id,pnr:b.pnr,doj:d,section:'missing_in_ota',status:'unmatched_gds',
   booking_status:b.status,expected:{fare:money(b.fare?.net??0),take_home:null},take_home:null,delta:null,differences:['missing_in_ota'],verified:false,why:'GDS redBus PNR absent from uploaded statement'});
 }
 const sum=(arr,k)=>money(arr.reduce((n,x)=>n+(Number(x[k])||0),0));
 const invoiceLines=rows.filter(x=>x.section!=='missing_in_ota');
 const expectedRows=invoiceLines.filter(x=>x.expected&&x.section==='sold');
 const stmtAmount=parsed.summary.invoice_amount;
 const totals={
  invoice_amount:stmtAmount,invoice_lines:parsed.statement_lines,parsed_events:parsed.rows.length,
  gds_comparable:invoiceLines.filter(x=>!!x.expected).length,verified:rows.filter(x=>x.verified).length,
  matched:rows.filter(x=>x.status==='matched').length,mismatched:rows.filter(x=>x.status==='mismatched').length,
  needs_review:rows.filter(x=>x.status==='needs_review').length,
  missing_in_gds:rows.filter(x=>x.status==='unmatched_ota').length,missing_in_ota:rows.filter(x=>x.status==='unmatched_gds').length,
  resolved:rows.filter(x=>x.resolution?.action).length,
  disputed:rows.filter(x=>x.resolution?.action==='dispute').length,
  gds_expected:sum(expectedRows.map(x=>({v:x.expected.take_home})),'v'),
  ota_ticket_take_home:sum(invoiceLines.filter(x=>x.section==='sold'),'take_home'),
  discrepancy_total:sum(rows.filter(x=>x.delta!=null),'delta'),
  outstanding_issue_count:rows.filter(x=>x.status!=='matched').length,
  at_risk_amount:money(rows.filter(x=>x.status==='mismatched'&&x.delta!=null).reduce((acc,x)=>acc+Math.abs(x.delta),0))
 };
 const sectionStats={};
 for(const section of ['sold','pax_cancelled','bus_cancelled','exceptional_refund']){
  const set=rows.filter(x=>x.section===section);const comparable=set.filter(x=>!!x.expected);
  sectionStats[section]={count:set.length,invoice_fare:sum(set,'fare'),invoice_tax:sum(set,'tax'),invoice_gross:money(sum(set,'fare')+sum(set,'tax')),take_home:sum(set,'take_home'),
  gds_count:comparable.length,gds_expected_fare:comparable.length?money(comparable.reduce((v,x)=>v+(x.expected.fare||0)+(x.expected.tax||0),0)):null,
  gds_expected_payout:comparable.length?money(comparable.reduce((v,x)=>v+(x.expected.take_home||0),0)):null,
  fare_diff:comparable.length?money(comparable.reduce((v,x)=>v+(x.fare||0)+(x.tax||0)-(x.expected.fare||0)-(x.expected.tax||0),0)):null,
  payout_diff:comparable.length?sum(comparable,'delta'):null};
 }
 return {rows,totals,section_stats:sectionStats};
}
const statusForCsv=s=>({matched:'Matched',mismatched:'Mismatched',needs_review:'Needs Review',unmatched_ota:'Missing in GDS',unmatched_gds:'Missing in OTA'}[s]||s||'');
const EXPORT_HEADERS=['PNR','DOJ (SaveTrip)','DOJ (OTA)','Fare (SaveTrip)','Fare (OTA)','Operator Offer (OTA)','Tax (SaveTrip)','Tax (OTA)','Commission (OTA)','Tax on Commission (OTA)','TDS (OTA)','TCS (OTA)','Payable (SaveTrip)','Take-home (OTA)','Take-home Diff','Status','Resolved By','Notes'];
const csvEscape=v=>{let value=String(v??'');if(typeof v!=='number'&&/^[=+@\t\r]|^-(?!\d+(?:\.\d+)?$)/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"'};
function exportCsv(doc,filter='all'){
 const rows=doc.lines.filter(x=>filter==='all'||x.status===filter);
 const mapped=rows.map(r=>[r.pnr,r.doj_gds||r.expected?.doj||'',r.doj||'',r.expected?.fare,r.fare,r.operator_offer,r.expected?.tax,r.tax,r.commission,r.commission_tax,'','',r.expected?.take_home,r.take_home,r.delta,r.resolution?.action?'Resolved: '+r.resolution.action:statusForCsv(r.status),r.resolution?.by||'',r.resolution?.note||r.why||'']);
 return '\ufeff'+[EXPORT_HEADERS,...mapped].map(x=>x.map(csvEscape).join(',')).join('\r\n')+'\r\n';
}
module.exports={invoiceFormula,extractPdf,parsePaymentAdviceText,parseLineItems,parseSummary,compareInvoice,exportCsv,EXPORT_HEADERS,positionedLines};
