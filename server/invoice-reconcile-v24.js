'use strict';
const S=require('./invoices-v24');
const num=v=>v===undefined||v===null||v===''?null:Number(v);
const total=(rows,key)=>Array.isArray(rows)&&rows.length&&rows.every(x=>num(x[key])!==null)?
 Math.round(rows.reduce((v,r)=>v+Number(r[key]),0)*100)/100:null;
const amount=(source,...keys)=>{for(const k of keys){const n=num(source?.[k]);if(n!==null&&Number.isFinite(n))return n;}return null;};
const r2=n=>Math.round(Number(n)*100)/100;
const match=(a,b)=>Math.abs(r2(a)-r2(b))<=.025;
const aliases={
 whatsapp:/whats\s*app|whatsapp/i,
 sms:/\bsms\b/i,
 ai_messages:/ai\s+(?:messages|replies)/i,
 cloud:/cloud\s+calling/i,
 ai_calls:/ai\s+calling/i,
 number_rental:/number\s+rental/i,
 commission:/ticket\s+reservation\s+service|commission/i,
 connection:/metro\s*[-–]?\s*bus\s+connection/i
};
function audit(month,{scope='reference'}={}){
 if(!S.validMonth(month))throw Object.assign(new Error('Invalid month'),{status:400});
 const docs=S.catalogue().filter(d=>d.period_month===month&&(scope==='all'||(scope==='reference'?d.is_reference:!d.is_reference)));
 const byType=Object.fromEntries(docs.map(d=>[d.type,{...d,record:S.resolve(d.key).row}]));
 const snap=t=>byType[t]?.record?.snapshot||null;
 const checks=[];
 const add=(id,label,left,right,detail='')=>{
   const ready=left!==null&&right!==null&&Number.isFinite(left)&&Number.isFinite(right);
   checks.push({id,label,status:!ready?'missing':match(left,right)?'match':'mismatch',
    left:left===null?null:r2(left),right:right===null?null:r2(right),difference:!ready?null:r2(left-right),
    explanation:detail});
 };
 const tax=snap('tax'),metro=snap('metro'),chat=snap('chat'),cloud=snap('cloud'),ai=snap('ai'),platform=snap('platform'),operator=snap('operator');
 const taxLines=tax?.line_items||[];
 const taxLine=regex=>total(taxLines.filter(x=>regex.test(String(x.description||''))),'taxable');
 const chatRows=chat?.summary_rows||[];
 const chatRow=regex=>total(chatRows.filter(x=>regex.test(String(x.label||''))),'amount');
 const callRows=cloud?.summary_rows||[];
 const callRow=regex=>total(callRows.filter(x=>regex.test(String(x.label||x.service||''))),'charge');
 const aiRows=ai?.summary_rows||[];
 const aiRow=regex=>total(aiRows.filter(x=>regex.test(String(x.label||x.service||''))),'charge');
 const os=operator?.ledger||[];
 const debits=type=>total(os.filter(x=>new RegExp(type,'i').test(String(x.type||''))),'deducted');
 const credits=type=>total(os.filter(x=>new RegExp(type,'i').test(String(x.type||''))),'collected');
 const tt=tax?.totals||{};
 const taxable=amount(tt,'taxable','taxable_total');
 const taxes=Array.from(['cgst','sgst','igst']).map(k=>amount(tt,k));
 const gst=taxes.some(x=>x!==null)?r2(taxes.reduce((v,x)=>v+(x||0),0)):null;
 const grand=amount(tt,'total','grand_total');
 add('tax-total','Taxable services plus GST = tax invoice total',
   taxable===null||gst===null?null:r2(taxable+gst),grand,
   'The tax invoice is for the platform services supplied to the operator, not passenger fares');
 add('operator-tax','Operator statement invoice deduction = issued tax invoice',
   debits('^Invoice$'),grand,'Operator statement is a net payable ledger, tax invoice is the separate taxable source');
 const metroRows=metro?.summary_rows||[];
 const metroFare=amount(metro?.totals,'metro_fares','total_fares','amount')??total(metroRows,'metro_fares');
 add('metro-total','Metro operator fares sum to feeder statement total',total(metroRows,'metro_fares'),metroFare,
   'Metro ticket fares are a pure-agent deduction; do not include in taxable platform-service invoice');
 add('metro-operator','Metro feeder total = operator ledger Metro deduction',
   metroFare,debits('^Metro$'),'GST-exempt feeder fares must not be mixed with taxable Metro–Bus connection service');
 const chatTotal=amount(chat?.totals,'before_gst','amount','total')??total(chatRows,'amount');
 add('chat-total','WhatsApp, AI replies and SMS usage sum',total(chatRows,'amount'),chatTotal);
 add('chat-whatsapp','WhatsApp charges agree with tax invoice taxable line',chatRow(/outgoing|whats\s*app/i),taxLine(aliases.whatsapp));
 add('chat-ai','AI message charges agree with tax invoice taxable line',chatRow(/ai replies|ai messages/i),taxLine(aliases.ai_messages));
 add('chat-sms','SMS charges agree with tax invoice taxable line',chatRow(/sms/i),taxLine(aliases.sms));
 add('cloud-call','Cloud call charges agree with tax invoice taxable line',callRow(aliases.cloud),taxLine(aliases.cloud),
   'Call count is not the same as billable rounded line-minutes used on the invoice');
 add('cloud-rental','Cloud number rental agrees with taxable invoice line',callRow(aliases.number_rental),taxLine(aliases.number_rental));
 add('ai-call','AI voice charges agree with taxable invoice line',aiRow(aliases.ai_calls),taxLine(aliases.ai_calls),
   'The number of AI calls is different from billable minutes; do not compare call count to invoice quantity');
 const comm=amount(platform?.totals,'total_commission','commission_before_gst');
 add('platform-commission','Platform Sales commission = taxable commission invoice lines',
    comm,taxLine(aliases.commission),'Use service-line commission amount, not gross ticket sales');
 const pssGrand=amount(platform?.totals,'net_to_operator');
 const osSales=credits('^Platform Sales$');
 checks.push({id:'platform-net',label:'Platform Sales statement net-to-operator and posted platform receipts',
  status:'informational',left:pssGrand,right:osSales,difference:null,
  explanation:'These fields have different definitions. Reconcile collections, refunds, commission and taxes by transaction before assuming equality.'});
 return {month,scope,documents:docs.map(({key,type,label,name,has_pdf,has_snapshot})=>({key,type,label,name,has_pdf,has_snapshot})),
   checks,summary:{matched:checks.filter(x=>x.status==='match').length,
    mismatched:checks.filter(x=>x.status==='mismatch').length,
    insufficient_evidence:checks.filter(x=>x.status==='missing').length}};
}
module.exports={audit};
