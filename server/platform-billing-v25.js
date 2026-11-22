'use strict';
// Authoritative platform-side monthly issuance: NO operator create/upload route.
// Requires a configured legal issuer and sealed, provenance-backed billing snapshots.
// The current JSON store is suitable for development only; move transactions to PostgreSQL for production.
const db=require('./db'),U=require('./util'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const Legacy=require('./invoices-v24'),PDF=require('./platform-billing-pdf-v25');
const types=['tax','metro','cloud','ai','chat','platform','operator'];
const bad=(s,status=400)=>Object.assign(new Error(s),{status});
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const finite=n=>n!==''&&n!==null&&n!==undefined&&Number.isFinite(Number(n));
const amount=n=>{if(!finite(n))throw bad('Missing or invalid money amount');return round(n);};
const sum=(xs,k)=>round(xs.reduce((v,r)=>v+amount(r[k]),0));
const equal=(a,b)=>Math.abs(amount(a)-amount(b))<.011;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const localDate=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
const localMonth=()=>localDate().slice(0,7);
const lastDay=month=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10);
const firstDay=month=>month+'-01';
const legal=id=>/^[0-9A-Z]{15}$/.test(String(id||''));
const safeName=x=>String(x||'').slice(0,170).replace(/[^\w .\-\/]/g,'');
const cfg=()=>db.meta('platform_billing_v25');
const currOperator=()=>db.meta('operator')||{};
function configured(){
 const v=cfg(),op=currOperator();
 if(!v||!v.issuer||!v.operator)throw bad('Platform billing issuer and recipient profiles are not configured',409);
 for(const k of ['legal_name','address','email','phone','gstin','bank_name','bank_account_name','bank_account_number','bank_ifsc'])
  if(!String(v.issuer[k]||'').trim())throw bad('Missing legal issuer field: '+k,409);
 if(!legal(v.issuer.gstin))throw bad('Issuer GSTIN is invalid',409);
 for(const k of ['operator_id','legal_name','address','state'])
  if(!String(v.operator[k]||'').trim())throw bad('Missing operator billing profile: '+k,409);
 if(String(v.operator.operator_id)!==String(op.operator_id))throw bad('Operator profile must match current tenant',403);
 if(v.operator.gstin&&!legal(v.operator.gstin))throw bad('Operator GSTIN is invalid',409);
 return v;
}
function configure(body){
 const issuer=body?.issuer||{},operator=body?.operator||{};
 const data={issuer:{...issuer},operator:{...operator},updated_at:new Date().toISOString()};
 db.meta('platform_billing_v25',data);
 try{configured();}catch(e){db.meta('platform_billing_v25',null);throw e;}
 return {configured:true,operator_id:String(operator.operator_id),issuer:issuer.legal_name};
}
function checkRows(rows,name,limit=20000){
 if(!Array.isArray(rows)||rows.length>limit)throw bad(name+' must be an array with maximum '+limit+' rows');
 return rows;
}
function verifiedEvent(s){
 const t=String(s.type||''),month=String(s.month||''),operator=currOperator();
 if(!types.includes(t))throw bad('Unknown billing source family');
 if(!Legacy.validMonth(month))throw bad('Invalid month');
 if(String(s.operator_id)!==String(operator.operator_id))throw bad('Wrong billing operator',403);
 if(!s.verified||!s.locked||!Array.isArray(s.source_refs)||!s.source_refs.length||
   s.source_refs.some(x=>!String(x||'').trim()))
  throw bad('Source must be locked, verified and include billing evidence identifiers');
 if(!s.snapshot||typeof s.snapshot!=='object'||Array.isArray(s.snapshot))throw bad('Structured bill snapshot required');
 const snap=Legacy.validateSnapshot(t,s.snapshot);
 // Unknown keys are rejected: a payload that is only partly mapped may hide a material monetary field.
 const allowed=['invoice_meta','line_items','totals','billing_address','shipping_address','place_of_supply','bank',
  'notes','summary_rows','lines','ledger','provisional_ledger','channel_summary','opening_balance',
  'closing_balance','posted_closing_balance','provisional_balance'];
 for(const k of Object.keys(s.snapshot))if(!allowed.includes(k))throw bad('Unsupported billing snapshot field: '+k);
 if(t==='tax'){
  const lines=checkRows(snap.line_items,'Tax invoice line items',500);
  if(!lines.length)throw bad('Tax invoice needs explicit service lines');
  let taxable=0,gst=0;
  for(const x of lines){
   if(!x.description||!x.sac||!finite(x.rate)||!finite(x.qty)||!finite(x.gst_rate))
    throw bad('Tax line requires description, SAC, rate, quantity and GST rate');
   if(x.qty<=0||x.rate<0||x.gst_rate<0||x.gst_rate>100)throw bad('Invalid tax rate/quantity');
   const base=round(x.rate*x.qty),tax=round(base*x.gst_rate/100);
   if(!equal(base,x.taxable)||!equal(base+tax,x.total))throw bad('Tax line does not reconcile: '+x.description);
   taxable=round(taxable+base);gst=round(gst+tax);
  }
  if(!snap.invoice_meta||!Legacy.validDate(snap.invoice_meta.due_date))throw bad('Invoice due date required from contract');
  if(!snap.place_of_supply)throw bad('Place of supply required');
  if(!snap.totals||!equal(taxable,snap.totals.taxable)||!equal(gst,round((snap.totals.cgst||0)+(snap.totals.sgst||0)+(snap.totals.igst||0)))||
    !equal(taxable+gst,snap.totals.total))throw bad('Tax GST and grand totals do not reconcile');
 }else if(t==='metro'){
  const rows=checkRows(snap.lines,'Metro ticket rows');
  checkRows(snap.summary_rows,'Metro operator summaries');
  for(const x of rows){
   if(!x.date||!x.pnr||!x.metro||!x.passenger_station||!x.exchange_point||!x.ticket_evidence_id||
     !finite(x.pax)||x.pax<1||!finite(x.fare_per_pax)||!finite(x.fare)||
     !equal(x.fare,x.pax*x.fare_per_pax))throw bad('Metro ticket fare/evidence missing');
  }
  if(!snap.totals||!equal(sum(rows,'fare'),snap.totals.metro_fares)||!equal(sum(rows,'pax'),snap.totals.passengers)||
     !equal(sum(snap.summary_rows,'metro_fares'),snap.totals.metro_fares))throw bad('Metro provider totals do not reconcile');
 }else if(t==='chat'){
  checkRows(snap.summary_rows,'Chat charge rows');
  if(!snap.totals||!equal(sum(snap.summary_rows,'amount'),snap.totals.before_gst))throw bad('Message totals do not reconcile');
 }else if(t==='cloud'||t==='ai'){
  const rows=checkRows(snap.lines,'Chargeable call events');
  const services=checkRows(snap.summary_rows,'Call usage summary');
  for(const x of rows)if(!x.call_id||!x.date||!x.time||!x.duration||!finite(x.charge)||x.charge<0)
   throw bad('Billed call needs provider ID, date/time, duration and charge');
  if(!snap.totals||!finite(snap.totals.total)||!services.length)throw bad('Call service totals required');
  const charges=sum(rows,'charge');
  const primary=services.find(x=>String(x.label||'').toLowerCase().includes(t==='cloud'?'cloud':'ai'));
  if(!primary||!equal(primary.charge,charges))throw bad('Call-line charges disagree with provider summary');
  if(!equal(sum(services,'total'),snap.totals.total))throw bad('Call summary grand total mismatch');
 }else if(t==='platform'){
  checkRows(snap.lines,'Platform PNR sale lines');checkRows(snap.channel_summary,'Channel summary');
  if(!snap.totals||!finite(snap.totals.total_commission)||!finite(snap.totals.net_to_operator))throw bad('Platform sale financial totals required');
  if(!snap.channel_summary.some(x=>/net to operator/i.test(String(x.label))))throw bad('Channel summary missing net to operator');
  const net=snap.channel_summary.find(x=>/net to operator/i.test(String(x.label)));
  if(!equal(net.total,snap.totals.net_to_operator))throw bad('Platform sales net not reconciled');
 }else if(t==='operator'){
  checkRows(snap.ledger,'Posted ledger');
  if(!finite(snap.opening_balance)||!finite(snap.posted_closing_balance))throw bad('Posted opening and closing balances required');
  const close=round(Number(snap.opening_balance)+snap.ledger.reduce((a,x)=>a+amount(x.collected||0)-amount(x.deducted||0),0));
  if(!equal(close,snap.posted_closing_balance))throw bad('Operator posted ledger does not reconcile');
  if(snap.provisional_ledger?.length && !finite(snap.provisional_balance))throw bad('Provisional balance required');
 }
 return {type:t,month,operator_id:String(s.operator_id),source_refs:s.source_refs.map(String),snapshot:snap,verified:true,locked:true};
}
function ingest(source){
 const clean=verifiedEvent(source),digest=sha(JSON.stringify(clean));
 const set=db.col('billing_source_snapshots');
 const existing=set.find(x=>x.type===clean.type&&x.month===clean.month&&String(x.operator_id)===clean.operator_id);
 if(existing){
  if(existing.digest!==digest)throw bad('Locked billing source cannot be replaced; use a correction/credit-note workflow',409);
  return {id:existing.id,reused:true};
 }
 const result=set.insert({...clean,digest,received_at:new Date().toISOString()});
 return {id:result.id,reused:false};
}
function validateGroup(month,sources){
 const by=Object.fromEntries(sources.map(x=>[x.type,x])),tax=by.tax.snapshot,metro=by.metro.snapshot,
  cloud=by.cloud.snapshot,ai=by.ai.snapshot,chat=by.chat.snapshot,platform=by.platform.snapshot,operator=by.operator.snapshot;
 const line=(pattern)=>tax.line_items.filter(x=>pattern.test(x.description||'')).reduce((v,x)=>v+amount(x.taxable),0);
 const call=(rows)=>rows.reduce((a,x)=>a+amount(x.charge),0);
 if(!equal(line(/whats\s*app/i),chat.summary_rows.filter(x=>/outgoing|whats\s*app/i.test(x.label)).reduce((v,x)=>v+amount(x.amount),0))||
    !equal(line(/AI messages|AI replies/i),chat.summary_rows.filter(x=>/AI replies|AI messages/i.test(x.label)).reduce((v,x)=>v+amount(x.amount),0))||
    !equal(line(/\bSMS\b/i),chat.summary_rows.filter(x=>/SMS/i.test(x.label)).reduce((v,x)=>v+amount(x.amount),0)))
    throw bad('Tax invoice messaging lines differ from usage statement');
 if(!equal(line(/cloud calling/i),call(cloud.lines))||!equal(line(/AI calling/i),call(ai.lines)))
    throw bad('Tax invoice telephony lines differ from provider usage');
 if(!equal(line(/number rental/i),cloud.summary_rows.filter(x=>/rental/i.test(x.label)).reduce((v,x)=>v+amount(x.charge),0)))
    throw bad('Cloud telephony rental mismatches tax invoice');
 const entries=operator.ledger;
 if(!equal(entries.filter(x=>/^invoice$/i.test(x.type)).reduce((v,x)=>v+amount(x.deducted||0),0),tax.totals.total))
    throw bad('Operator invoice ledger debit does not match issued platform tax invoice');
 if(!equal(entries.filter(x=>/^metro$/i.test(x.type)).reduce((v,x)=>v+amount(x.deducted||0),0),metro.totals.metro_fares))
    throw bad('Operator Metro deduction does not match fare statement');
 if(!equal(line(/reservation service/i),platform.totals.total_commission))
    throw bad('Platform commission does not match taxable reservation commission');
}
const pdfDir=()=>path.join(path.dirname(db.DB_FILE),'invoice-pdfs');
function newNumber(type,month,n){
 const y=month.slice(0,4),prefix={tax:'TAX',metro:'MFS',cloud:'CCS',ai:'AIC',chat:'CHS',platform:'PSS',operator:'OS'}[type];
 return prefix+'-'+y+'-'+String(n).padStart(5,'0');
}
function due(month,now=localMonth()){return Legacy.validMonth(month)&&month<now;}
function runDue(now=localMonth()){
 const config=configured(),id=String(config.operator.operator_id);
 if(!Legacy.validMonth(now))throw bad('Invalid billing clock');
 const eligible=[...new Set(db.col('billing_source_snapshots').filter(x=>String(x.operator_id)===id&&due(x.month,now)).map(x=>x.month))].sort();
 const summary={issued:[],skipped:[]};
 for(const month of eligible){
  const sources=db.col('billing_source_snapshots').filter(x=>x.month===month&&String(x.operator_id)===id);
  const missing=types.filter(t=>!sources.some(s=>s.type===t&&s.verified&&s.locked));
  if(missing.length){summary.skipped.push({month,reason:'Missing verified monthly sources',types:missing});continue;}
  if(types.every(t=>db.col('billing_documents').find(d=>d.type===t&&d.month===month&&
    String(d.operator_id)===id&&d.platform_generated&&d.status==='issued')))continue;
  try{validateGroup(month,sources);}catch(err){summary.skipped.push({month,reason:err.message});continue;}
  // All 7 PDFs are prepared and verified BEFORE any document is committed.
  const data=[];
  let seq=db.meta('platform_billing_seq_v25')||{};
  for(const type of types){
   if(db.col('billing_documents').find(d=>d.type===type&&d.month===month&&
      String(d.operator_id)===id&&d.platform_generated&&d.status==='issued'))continue;
   const source=sources.find(x=>x.type===type);
   const next=(Number(seq[type])||0)+1;seq[type]=next;
   const number=newNumber(type,month,next),date=localDate();
   const doc={type,number,month,period_start:firstDay(month),period_end:lastDay(month),issue_date:date,
      issuer:config.issuer,operator:config.operator,snapshot:source.snapshot};
   const bytes=PDF.generate(doc);
   if(bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-100).toString().includes('%%EOF'))
     throw bad('Generated PDF integrity check failed');
   data.push({...doc,bytes,hash:sha(bytes),source_id:source.id,source_digest:source.digest});
  }
  fs.mkdirSync(pdfDir(),{recursive:true,mode:0o700});
  for(const x of data){
   const filename=path.join(pdfDir(),x.hash+'.pdf');
   if(!fs.existsSync(filename))fs.writeFileSync(filename,x.bytes,{flag:'wx',mode:0o600});
  }
  // Idempotent single-node development persistence. In production this requires one DB transaction and outbox.
  for(const x of data){
   db.col('billing_documents').insert({
    operator_id:id,type:x.type,kind:x.type,label:Legacy.TYPES[x.type].label,
    name:x.number,month:x.month,date:x.issue_date,period_start:x.period_start,period_end:x.period_end,
    snapshot:x.snapshot,source_id:x.source_id,source_digest:x.source_digest,
    status:'issued',platform_generated:true,reference_only:false,pdf_sha256:x.hash,
    original_filename:x.number+'.pdf',pdf_bytes:x.bytes.length,issued_at:new Date().toISOString(),
    amount:x.type==='operator'?x.snapshot.posted_closing_balance:
     (x.snapshot.totals?.total??x.snapshot.totals?.metro_fares??x.snapshot.totals?.before_gst??null)
   });
   summary.issued.push({month,type:x.type,number:x.number});
  }
  db.meta('platform_billing_seq_v25',seq);
 }
 return summary;
}
function issuedDocs(){
 const id=String(currOperator().operator_id||'');
 return Legacy.catalogue().filter(x=>x.source==='issued'&&!x.is_reference&&x.status==='issued').filter(x=>{
  const d=Legacy.resolve(x.key).row;
  return d.platform_generated===true&&String(d.operator_id)===id;
 });
}
function latest(){
 return issuedDocs().filter(x=>x.type==='operator').sort((a,b)=>b.document_date.localeCompare(a.document_date)||b.period_month.localeCompare(a.period_month))[0]||null;
}
function list(){
 const documents=issuedDocs(),statement=latest(),r=statement?Legacy.resolve(statement.key).row:null;
 const n=r?amount(r.snapshot.posted_closing_balance):null;
 return {documents,types:Object.entries(Legacy.TYPES).map(([id,x])=>({id,label:x.label})),
  years:[...new Set(documents.map(x=>x.period_month.slice(0,4)))].sort().reverse(),
  balance:{statement:statement?.name||null,statement_key:statement?.key||null,
   statement_date:statement?.document_date||null,closing_balance:n,payable_to_operator:n===null?null:Math.max(0,n),
   payable_by_operator:n===null?null:Math.max(0,-n),has_evidence:n!==null,
   pending_payments:db.col('invoice_payments').filter(x=>x.status==='pending_verification').length},
  reference_current:null,auto_issued:true,scope:'operator'};
}
function ensureIssued(key){
 const doc=issuedDocs().find(x=>x.key===key);
 if(!doc)throw bad('Issued document not found for this operator',404);
 return doc;
}
function getPdf(key){ensureIssued(key);return Legacy.getPdf(key);}
function bundle(month){
 if(!Legacy.validMonth(month))throw bad('Invalid month');
 const docs=issuedDocs().filter(d=>d.period_month===month);
 if(!docs.length)throw bad('No issued documents for this month',404);
 if(docs.length!==types.length)throw bad('Monthly statement bundle is incomplete',409);
 return Legacy.zip(docs.map(d=>[d.name.replace(/[/\\]/g,'-')+'.pdf',getPdf(d.key).bytes]));
}
function recordPayment(body,user){
 const bal=list().balance,due=bal.payable_by_operator;
 if(!(due>0))throw bad('No issued payable-by-operator balance',400);
 const value=amount(body.amount),reference=String(body.reference||'').trim(),id=String(currOperator().operator_id);
 if(value<=0||value>due+.011)throw bad('Invalid payment amount');
 if(reference.length<5||reference.length>120)throw bad('Valid bank transfer reference required');
 if(db.col('invoice_payments').find(x=>String(x.operator_id)===id&&String(x.reference).toLowerCase()===reference.toLowerCase()))
  throw bad('Payment reference already submitted',409);
 const doc=latest();
 const p=db.col('invoice_payments').insert({operator_id:id,amount:value,reference,
  date:U.today(),by:user?.name||user?.id,status:'pending_verification',statement_key:doc.key});
 return {id:p.id,amount:p.amount,status:p.status,message:'Reference recorded; transfer not initiated, and statement balance unchanged'};
}
module.exports={types,configure,configured,verifiedEvent,ingest,validateGroup,due,runDue,list,issuedDocs,latest,ensureIssued,getPdf,bundle,recordPayment};
