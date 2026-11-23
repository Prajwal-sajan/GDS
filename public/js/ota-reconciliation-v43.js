/* Accounts → OTA Invoice Verifier v43: complete redBus payment-advice workflow.
   Every amount/status is returned from the authenticated API, never seeded from screenshots. */
(function(){
'use strict';
if(!window.G?.screens?.accounts||G.__otaVerifierV43)return;
G.__otaVerifierV43=true;
const older=G.screens.accounts;
const escH=s=>esc(s==null?'':String(s));
const val=n=>n===null||n===undefined||n===''?'—':inr(n,2);
const int=n=>Number(n||0).toLocaleString('en-IN');
const fmt=d=>d?fdate(d):'—';
const count=d=>Number(d||0);
const amount=(n,sign)=>n==null?'—':(sign&&n>0?'+':'')+inr(n,2);
const ICO={
 back:'M15 18l-6-6 6-6',upload:'M12 16V3m-5 5 5-5 5 5M3 15v5h18v-5',
 document:'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6m-6 4h6m-6 4h4',
 arrow:'M9 18l6-6-6-6',chevron:'m6 9 6 6 6-6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 trash:'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7',search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16m6-2 4 4',
 download:'M12 3v13m-5-5 5 5 5-5M5 19v2h14v-2',check:'M4 12l5 5L20 6',close:'M5 5l14 14M19 5 5 19',
 warning:'M12 3 2 21h20L12 3zM12 9v5m0 4h.01',chart:'M3 18v-6m6 6V8m6 10V4m6 14V9',
 cards:'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
 table:'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16',
 refresh:'M4 8V3m0 5h5m11 8v5m0-5h-5M5 12a7 7 0 0 1 12-5m2 5a7 7 0 0 1-12 5',
 filter:'M4 6h16M7 12h10m-7 6h4',shield:'M12 2l8 4v6c0 6-4 9-8 10-4-1-8-4-8-10V6zM8 12l3 3 5-6',
 info:'M12 11v6m0-10h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
 receipt:'M5 2h14v20l-3-2-4 2-4-2-3 2V2zM9 7h6M9 12h6M9 17h4',
 adjust:'M4 14l6-6 4 4 6-7m-6 0h6v6'
};
const icon=(name,size)=>'<svg width="'+(size||18)+'" height="'+(size||18)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(ICO[name]||ICO.info)+'"/></svg>';
const btn=(name,label,kind,other)=>'<button type="button" class="ota43-btn '+(kind||'')+'" data-ota43="'+name+'" '+(other||'')+'>'+label+'</button>';
const route=id=>'#/accounts/reconciliation'+(id?'/'+encodeURIComponent(id):'');
const badges=(list)=>list.map(x=>'<span class="ota43-badge '+(x[2]||'')+'">'+x[0]+(x[1]!==undefined?' <strong>'+int(x[1])+'</strong>':'')+'</span>').join('');
const block=(title,body,klass)=>'<section class="ota43-block '+(klass||'')+'"><h3>'+title+'</h3>'+body+'</section>';
const q=(p)=>'/reconciliation/v43/invoices'+(p||'');
const status=(s)=>({matched:'Matched',mismatched:'Mismatched',needs_review:'Needs review',unmatched_ota:'Missing in GDS',unmatched_gds:'Missing in OTA'}[s]||s||'—');
const badge=s=>'<span class="ota43-tag '+escH(s)+'">'+escH(status(s))+'</span>';
const noteWarn=(data)=>data.parse_warnings?.length?'<div class="ota43-warning">'+icon('warning')+'<span><strong>Import warnings</strong><small>'+data.parse_warnings.map(escH).join(' · ')+'</small></span></div>':'';
const copyDate=s=>s?String(s).slice(0,10):'';
const pricing=(d)=>{
 const s=d.summary||{},v=x=>val(s[x]),entries=[
 ['Booking revenue (a)','bookings','+'],['Pax cancellations (b)','pax_cancel','−'],
 ['Retention credit (c)','cancellation_credit','+'],['Operator cancellations (d)','operator_cancel','−'],
 ['Exceptional refund (e)','exception_refund','−'],['Operator offers (h)','operator_offers','−'],
 ['TCS deductions (l)','tcs','−'],['TDS 194-O (m)','tds','−']];
 return '<div class="ota43-breakdown"><div class="ota43-breakdown-head"><p>INVOICE BREAKDOWN</p><h2>How RedBus arrived at <strong>'+v('invoice_amount')+'</strong></h2><span>Every rupee traced from statement revenue to bank payout · '+int(d.statement_lines)+' ticket events</span>'+(d.summary_delta===0?'<span class="ota43-tag matched">PDF TOTAL AGREES</span>':badge('needs_review'))+'</div>'+
 '<div class="ota43-revenue"><div><span class="ota43-label good">● REVENUE EARNED</span><p>Fare collected and settlement amount before deductions</p></div><div class="ota43-large">'+icon('receipt',24)+'<div><b>Bookings (a)</b><br><small>'+int(d.by_section?.sold)+' statement rows</small></div></div><strong>'+v('bookings')+'</strong></div>'+
 '<div class="ota43-adjust"><div><span class="ota43-label orange">● CANCELLATION ADJUSTMENTS</span><p>Refunds, retention credits and bus cancellations</p></div><div>'+entries.slice(1,5).map(x=>'<div class="ota43-finrow"><span>'+x[0]+'</span><b class="'+(x[2]==='+'?'green':'red')+'">'+x[2]+' '+v(x[1])+'</b></div>').join('')+'</div></div>'+
 '<div class="ota43-adjust"><div><span class="ota43-label blue">● OTHER DEDUCTIONS</span><p>Offers, TCS and TDS from the invoice summary</p></div><div>'+entries.slice(5).map(x=>'<div class="ota43-finrow"><span>'+x[0]+'</span><b>'+x[2]+' '+v(x[1])+'</b></div>').join('')+'</div></div>'+
 '<div class="ota43-payout"><div><span>● NET PAYOUT</span><p>As stated on the redBus payment advice</p></div><strong>'+v('invoice_amount')+'</strong><div>'+icon('check',30)+'</div></div></div>';
};
const summaryTable=d=>{
 const rows=d.section_stats||{},invoice=d.summary||{};
 const lines=[
 ['Travelled','Confirmed bookings',rows.sold?.count,'bookings','sold'],
 ['Pax cancellations','Passenger initiated',rows.pax_cancelled?.count,'pax_cancel','pax_cancelled'],
 ['Operator cancellations','Bus did not run',rows.bus_cancelled?.count,'operator_cancel','bus_cancelled']];
 return '<section class="ota43-summary"><header><h3>Reconciliation summary</h3><small>Fares incl. GST, then payout after commission · GDS vs RedBus · '+int(d.statement_lines)+' lines</small></header><div class="ota43-scroll"><table><thead><tr><th>CATEGORY</th><th>COUNT</th><th>GDS EXPECTED</th><th>REDBUS REPORTED</th><th>FARE DIFF</th><th>PAYOUT DIFF</th></tr></thead><tbody>'+
 lines.map(row=>'<tr><td><b>'+row[0]+'</b><small>'+row[1]+'</small></td><td>'+int(row[2])+'</td><td>—</td><td>'+val(invoice[row[3]])+'</td><td>—</td><td>—</td></tr>').join('')+
 '<tr class="total"><td>Total</td><td>'+int(d.statement_lines)+'</td><td>'+val(d.totals?.gds_expected)+'</td><td>'+val(invoice.invoice_amount)+'</td><td>—</td><td>'+val(d.totals?.discrepancy_total)+'</td></tr></tbody></table></div><footer>'+icon('adjust')+'<strong>GDS comparison is evidence-based</strong><span>Missing GDS financial fields remain unverified; unallocated invoice deductions are not assigned to PNRs.</span></footer></section>';
};
function filters(d,s){
 const t=d.totals||{},data=[
 ['all','Total PNRs',t.invoice_lines,'dark'],['matched','Matched',t.matched,'green'],
 ['mismatched','Mismatched',t.mismatched,'orange'],['needs_review','Needs review',t.needs_review,'orange'],
 ['unmatched_ota','Missing in GDS',t.missing_in_gds,'red'],['unmatched_gds','Missing in OTA',t.missing_in_ota,'orange'],['disputed','Disputed',t.disputed||0,'orange']];
 return '<div class="ota43-browser-controls"><div class="ota43-control-top">'+btn('back',''+icon('back')+' Back','back')+
 '<div class="ota43-pillset">'+data.map(x=>'<button data-ota43="filter" data-filter="'+x[0]+'" class="ota43-badge '+x[3]+' '+(s.filter===x[0]?'active':'')+'">'+x[1]+' <strong>'+int(x[2])+'</strong></button>').join('')+
 '</div></div><div class="ota43-control-bottom"><input type="search" data-ota43-search placeholder="Search PNR..." value="'+escH(s.search||'')+'" aria-label="Search PNR"/>'+
 '<div class="ota43-view-switch">'+btn('cards',icon('cards')+' Cards',s.view==='cards'?'on':'')+btn('table',icon('table')+' Table',s.view==='table'?'on':'')+'</div>'+btn('export',icon('download')+' Export CSV','download')+'</div></div>';
}
function labelFlag(flag){
 return ({missing_in_gds:'In OTA, not in GDS',missing_in_ota:'In GDS, not on invoice',status:'Status differs',doj:'Journey date differs',fare:'Fare differs',offer:'Offer differs',commission:'Commission differs',commission_tax:'Commission tax differs',cancellation_charge:'Cancellation charge differs',payout:'Payout differs'})[flag]||flag;
}
function flagchips(row){
 const flags=row.differences||[];
 return flags.map(flag=>'<span class="ota43-flag">'+escH(labelFlag(flag))+'</span>').join('')||'<span class="ota43-matchcheck">'+icon('check')+' No numeric difference detected</span>';
}
function rowActions(row){
 return row.status==='matched'?'<span class="ota43-green-icon">'+icon('check',23)+'</span>':
 btn('inspect',icon('search')+' Resolve','small pastel','data-line="'+escH(row.id)+'"');
}
function tableRows(lines){
 return '<div class="ota43-wide"><table class="ota43-compare"><thead><tr class="band"><th colspan="2"></th><th colspan="7" class="ourband"><span class="ota43-logo">S</span> As Per GDS</th><th colspan="8" class="otaband"><span class="ota43-logo red">R</span> As Per RedBus</th><th colspan="2" class="difference">'+icon('chart')+' Difference</th><th>ACTIONS</th></tr><tr><th>PNR</th><th>STATUS</th><th>DOJ</th><th>Fare</th><th>Tax</th><th>Paid by Pax</th><th>Commission</th><th>GST on Comm</th><th>Offer</th><th>Expected</th><th>DOJ</th><th>Fare</th><th>Tax</th><th>Paid by Pax</th><th>Commission</th><th>GST on Comm</th><th>Op. Offer</th><th>Take-home</th><th>Diff</th><th>Result</th><th>Actions</th></tr></thead><tbody>'+
 lines.map(x=>'<tr><td><button class="ota43-pnr" data-ota43="inspect" data-line="'+escH(x.id)+'">'+escH(x.pnr)+'</button><small>'+escH(x.section)+'</small></td><td>'+badge(x.status)+'</td>'+
 '<td>'+fmt(x.doj_gds||x.doj)+'</td><td>'+val(x.expected?.fare)+'</td><td>'+val(x.expected?.tax)+'</td><td>'+val(x.expected?.fare==null?null:(x.expected.fare+x.expected.tax))+'</td><td>'+val(x.expected?.commission)+'</td><td>'+val(x.expected?.commission_tax)+'</td><td>'+val(x.expected?.operator_offer)+'</td><td>'+val(x.expected?.take_home)+'</td>'+
 '<td>'+fmt(x.doj)+'</td><td>'+val(x.fare)+'</td><td>'+val(x.tax)+'</td><td>'+val(x.fare==null||x.tax==null?null:(x.fare+x.tax))+'</td><td>'+val(x.commission)+'</td><td>'+val(x.commission_tax)+'</td><td>'+val(x.operator_offer)+'</td><td>'+val(x.take_home)+'</td>'+
 '<td class="'+(count(x.delta)<0?'red':'green')+'">'+amount(x.delta,true)+'</td><td>'+flagchips(x)+'</td><td>'+rowActions(x)+'</td></tr>').join('')+'</tbody></table></div>';
}
function rowCards(lines){
 return '<div class="ota43-cards">'+lines.map(x=>{
  const diff=x.delta,statusName=x.status==='matched'?'MATCHED':x.status==='unmatched_ota'?'MISSING IN GDS':'NEEDS REVIEW';
  return '<article class="ota43-ticket"><header><div class="ota43-ticket-info"><span class="ota43-warnicon">'+icon(x.status==='matched'?'check':'warning',24)+'</span><div>'+badge(x.status)+' <code>'+escH(x.pnr)+'</code><small>Journey '+fmt(x.doj)+' · '+escH(x.section)+'</small></div></div><div class="ota43-extra">'+statusName+'<strong class="'+(count(diff)<0?'red':'green')+'">'+amount(diff,true)+'</strong></div></header>'+
  '<div class="ota43-ticket-values"><div><label>YOU EXPECT</label><b>'+val(x.expected?.take_home)+'</b></div><div><label>REDBUS PAYS</label><b>'+val(x.take_home)+'</b></div></div>'+
  '<div class="ota43-why">'+icon('info')+'<div><b>WHY</b><p>'+escH(x.why||'Verified')+'</p><div>'+flagchips(x)+'</div></div></div>'+
  '<footer>'+btn('accept',''+icon('check')+' Accept RedBus','success','data-line="'+escH(x.id)+'"')+btn('dispute','Dispute','outlined','data-line="'+escH(x.id)+'"')+
  (x.resolution?'<span class="ota43-resolution">'+escH(x.resolution.action)+' by '+escH(x.resolution.by)+'</span>':'')+btn('inspect',icon('search')+' Investigate '+icon('arrow'),'','data-line="'+escH(x.id)+'"')+'</footer></article>';
 }).join('')+'</div>';
}
function filterLineRows(lines,s){
 const f=s.issue||'all';
 if(f==='all')return lines;
 if(f==='any')return lines.filter(x=>x.status!=='matched');
 return lines.filter(x=>(x.differences||[]).includes(f));
}
function detailPanel(d,s){
 const t=d.totals||{},v=d.summary?.invoice_amount;
 const tabs=[['all','All differences',t.outstanding_issue_count],['missing_in_ota','In our data, not on invoice',t.missing_in_ota],['status','Status differs'],['fare','Fare differs'],['offer','Offer differs'],['commission','Commission differs'],['cancellation_charge','Cancellation charge differs'],['payout','Payout differs']];
 return '<div class="ota43-headline"><div><div class="ota43-line"><span class="ota43-ota-logo">R</span><div><small>RECONCILIATION DASHBOARD</small><h2>RedBus · '+fmt(d.billing_period_start)+' → '+fmt(d.billing_period_end)+'</h2><label>INVOICE '+escH(d.invoice_number)+'</label></div></div></div>'+btn('original',icon('eye')+' View source PDF','')+'</div>'+
 noteWarn(d)+
 '<section class="ota43-hero"><div><p>RedBus paid you</p><strong>'+val(v)+'</strong><small>across '+int(d.statement_lines)+' ticket events · '+fmt(d.billing_period_start)+' to '+fmt(d.billing_period_end)+'</small></div>'+
 '<div class="ota43-score"><div class="ota43-ring">'+(t.invoice_lines?Math.round(t.verified/t.invoice_lines*100):0)+'%</div><div><b>'+int(t.verified)+' of '+int(t.invoice_lines)+' verified</b><small>'+int(t.outstanding_issue_count)+' records require review</small></div></div></section>'+
 summaryTable(d)+
 '<section class="ota43-ticket-check"><header><div>'+icon('search',25)+'<span><h3>Ticket check</h3><small>'+int(t.invoice_lines)+' events · '+int(t.matched)+' verified · '+int(t.outstanding_issue_count)+' need review</small></span></div>'+badge(t.outstanding_issue_count?'needs_review':'matched')+'</header>'+
 '<div class="ota43-ticket-totals"><div><small>REDBUS PAYS (TICKETS)</small><strong>'+val(t.ota_ticket_take_home)+'</strong></div><div><small>GDS EXPECTS (COMPARABLE)</small><strong>'+val(t.gds_expected)+'</strong></div><div><small>COMPARISON DELTA</small><strong>'+amount(t.discrepancy_total,true)+'</strong></div><div><small>INVOICE AFTER SUMMARY DEDUCTIONS</small><strong>'+val(v)+'</strong><span>Source PDF amount</span></div></div>'+
 '<div class="ota43-issues">'+tabs.map(x=>'<button data-ota43="issue" data-issue="'+x[0]+'" class="'+(s.issue===x[0]?'active':'')+'">'+x[1]+(x[2]!==undefined?' '+int(x[2]):'')+'</button>').join('')+'</div>'+
 '<div class="ota43-actions">'+btn('ticket-csv',icon('download')+' CSV','')+'</div>'+
 '<div data-ota43-inline></div></section>'+
 '<div class="ota43-banner">'+icon('warning',26)+'<div><b>'+int(t.outstanding_issue_count)+' ticket events need review</b><small>Differences are computed from actual available GDS evidence; no auto-acceptance.</small></div>'+icon('arrow')+'</div>'+
 '<div class="ota43-quick"><button data-ota43="breakdown">'+icon('receipt',28)+'<span><strong>'+(s.breakdown?'Hide':'View')+' invoice breakdown</strong><small>See how RedBus arrived at '+val(v)+'</small></span>'+icon('arrow')+'</button>'+
 '<button data-ota43="browse">'+icon('cards',28)+'<span><strong>Browse all '+int(d.statement_lines)+' tickets</strong><small>Every imported PNR event · searchable and filterable</small></span>'+icon('arrow')+'</button></div>'+
 (s.breakdown?pricing(d):'');
}
async function uploadDialog(s){
 const m=G.modal({title:'Upload OTA Invoice',size:'lg',body:'<div class="ota43-upload-dialog"><div class="ota43-drop">'+icon('upload',32)+'<b>Drop redBus Payment Advice PDF here</b><small>Or select PDF from your computer</small><input data-upload-pdf type="file" accept=".pdf,application/pdf" aria-label="Choose PDF"/></div><label class="ota43-upload-label">OTA<select data-upload-ota><option value="redbus">RedBus</option></select></label><p>The file is stored privately with the operator GDS. Matching uses only bookings actually present. Max file size: 7 MB.</p><div class="ota43-modal-actions"><button class="ota43-btn" data-upload-cancel>Cancel</button><button class="ota43-btn primary" data-upload-submit>Upload & Verify</button></div></div>'});
 m.$('[data-upload-cancel]').onclick=()=>m.close();
 m.$('[data-upload-submit]').onclick=async()=>{
  const f=m.$('[data-upload-pdf]').files?.[0];if(!f)return G.toast('Choose a PDF','bad');
  if(!/\.pdf$/i.test(f.name)||f.size>7*1024*1024)return G.toast('PDF required, max 7MB','bad');
  const submit=m.$('[data-upload-submit]');submit.disabled=true;submit.textContent='Parsing invoice…';
  try{
   const buf=await f.arrayBuffer();let binary='';
   const bytes=new Uint8Array(buf);
   for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   const out=await G.post(q(),{ota_slug:'redbus',file_name:f.name,base64:btoa(binary)});
   m.close();G.toast(out.duplicate?'Invoice already uploaded':'Invoice parsed. Review reconciliation results.','ok');
   location.hash=route(out.id);
  }catch(err){G.err(err);submit.disabled=false;submit.textContent='Upload & Verify'}
 };
}
function ledger(docs){
 return '<section class="ota43-ledger"><header><div class="ota43-title"><span>'+icon('receipt',29)+'</span><div><small>SETTLEMENT LEDGER</small><h2>Uploaded Invoices</h2></div></div><div><span class="ota43-badge blue">● LIVE</span> '+btn('upload',icon('upload')+' Upload Invoice '+icon('arrow'),'primary')+'</div></header>'+
 '<div class="ota43-scroll"><table><thead><tr><th>OTA</th><th>PERIOD</th><th>INVOICE</th><th>PNRS</th><th>STATUS</th><th>MATCHED</th><th>ISSUES</th><th>UPLOADED</th><th>ACTIONS</th></tr></thead><tbody>'+
 (docs.length?docs.map(d=>'<tr><td><span class="ota43-ota-logo small">R</span> <b>RedBus</b></td><td>'+fmt(d.billing_period_start)+' → '+fmt(d.billing_period_end)+'</td><td><code>'+escH(d.invoice_number)+'</code><small>'+escH(d.file_name)+'</small></td><td>'+int(d.statement_lines)+'</td><td>'+badge(d.status==='parsed'?'needs_review':d.status)+'</td><td><b>'+int(d.totals?.verified)+'</b></td><td><span class="ota43-tag mismatched">'+int(d.totals?.outstanding_issue_count)+'</span></td><td>'+fmt(d.uploaded_at)+'</td><td>'+btn('view',''+icon('eye')+' View','primary small','data-id="'+d.id+'"')+btn('delete',icon('trash'),'icon','data-id="'+d.id+'"')+'</td></tr>').join(''):'<tr><td colspan="9"><div class="ota43-empty">'+icon('receipt',32)+'<b>No uploaded invoices yet</b><p>Upload a redBus Payment Advice PDF to reconcile it with GDS bookings.</p></div></td></tr>')+
 '</tbody></table></div></section>';
}
async function loadLines(s){
 const query=new URLSearchParams({filter:s.filter||'all',q:s.search||'',issue:s.issue&&s.issue!=='all'?s.issue:'',offset:String(s.offset||0),limit:'35'});
 const out=await G.get(q('/'+s.id+'/lines?'+query));
 s.rows=out.rows||[];s.rowCount=out.count||0;
}
function pager(s){
 return '<div class="ota43-pagination"><span>Showing '+int(s.rows.length?s.offset+1:0)+'–'+int(s.offset+s.rows.length)+' of '+int(s.rowCount)+'</span>'+
 btn('previous','Previous','',s.offset<=0?'disabled':'')+btn('next','Next','',s.offset+35>=s.rowCount?'disabled':'')+'</div>';
}
async function render(s){
 const root=s.root;
 if(!s.id){
  const list=await G.get(q());s.docs=list.imports||[];
  root.innerHTML=ledger(s.docs);return;
 }
 s.doc=await G.get(q('/'+s.id));
 if(s.mode==='browse'){
  await loadLines(s);
  root.innerHTML=filters(s.doc,s)+(s.view==='cards'?rowCards(s.rows):tableRows(s.rows))+pager(s);return;
 }
 root.innerHTML=detailPanel(s.doc,s);
 const inline=root.querySelector('[data-ota43-inline]');
 if(inline){
  const target={...s,filter:s.issue==='all'?'unresolved':'all'};
  await loadLines(target);
  s.rows=target.rows;
  const visible=target.rows.slice(0,15);
  inline.innerHTML=visible.length?tableRows(visible):'<p class="ota43-empty">No rows in this category. Use Browse all tickets for the complete ledger.</p>';
 }
}
async function openSource(id){
 const headers={};
 const token=localStorage.getItem('token');if(token)headers.Authorization='Bearer '+token;
 if(G.viewAs)headers['x-view-as']=G.viewAs;
 const res=await fetch('/api'+q('/'+id+'/original.pdf'),{headers});
 if(!res.ok)throw new Error('Unable to load original PDF');
 const blob=await res.blob(),url=URL.createObjectURL(blob);
 const win=window.open(url,'_blank','noopener');
 if(!win){const link=document.createElement('a');link.href=url;link.download='redbus-invoice.pdf';link.click()}
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function resolveDialog(s,row,action){
 if(row.status==='matched')return G.toast('This ticket is already verified','ok');
 const isDispute=action==='dispute',title=isDispute?'Dispute redBus payout':action==='accept_ota'?'Accept redBus amount':'Investigate ticket';
 const reason=await G.prompt(title,[{name:'note',label:'Reason / investigation note',required:isDispute,type:'textarea',value:row.resolution?.note||''}],{ok:isDispute?'Raise dispute':action==='accept_ota'?'Accept':'Save investigation'});
 if(!reason)return;
 const result=await G.post(q('/'+s.id+'/resolve'),{line_id:row.id,action,note:reason.note||''});
 G.toast('Resolution recorded with operator identity','ok');await render(s);
}
async function inspect(s,id){
 const pnr=String(id).split(':')[1]||'';
 const row=(s.rows||[]).find(x=>x.id===id) || ((await G.get(q('/'+s.id+'/lines?'+new URLSearchParams({q:pnr,limit:'100'})))).rows||[]).find(x=>x.id===id);
 if(!row)return G.toast('Open this row from Browse all tickets','warn');
 const m=G.modal({title:'Investigate · '+escH(row.pnr),size:'xl',body:'<div class="ota43-investigate">'+
 '<div class="ota43-investigate-head">'+badge(row.status)+'<p>'+escH(row.why||'—')+'</p></div>'+
 '<div class="ota43-ticket-values"><div><label>GDS EXPECTED</label><b>'+val(row.expected?.take_home)+'</b></div><div><label>REDBUS TAKE-HOME</label><b>'+val(row.take_home)+'</b></div></div>'+
 '<dl>'+Object.entries({PNR:row.pnr,Section:row.section,'Travel date (RedBus)':row.doj,'Travel date (GDS)':row.doj_gds||'',Route:row.route_code,Seats:row.seats,'Fare (OTA)':val(row.fare),'Fare (GDS)':val(row.expected?.fare),'Commission (OTA)':val(row.commission),'Commission (GDS)':val(row.expected?.commission),'GST on commission (OTA)':val(row.commission_tax),'Operator offer (OTA)':val(row.operator_offer),'Actual statement net':val(row.net_payable),'Take home (after offers)':val(row.take_home),Difference:amount(row.delta,true),Reason:row.why,'Resolution':row.resolution?.action||'Open','Last reviewed by':row.resolution?.by||''}).map(([k,v])=>'<dt>'+escH(k)+'</dt><dd>'+escH(v)+'</dd>').join('')+'</dl><div>'+flagchips(row)+'</div>'+
 '<div class="ota43-modal-actions">'+btn('accept',''+icon('check')+' Accept RedBus','success','data-line="'+escH(row.id)+'"')+btn('dispute','Dispute','outlined','data-line="'+escH(row.id)+'"')+btn('investigate','Record investigation','primary','data-line="'+escH(row.id)+'"')+'</div></div>'});
 m.el.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-ota43]');if(!b)return;
  const op=b.dataset.ota43;if(!['accept','dispute','investigate'].includes(op))return;
  m.close();await resolveDialog(s,row,op==='accept'?'accept_ota':op==='dispute'?'dispute':'investigating');
 });
}
G.screens.accounts=async function(el,p={}){
 if(p.tab!=='reconciliation')return older(el,p);
 await older(el,{...p,id:null});
 const root=el.querySelector('[data-ac10-page]');if(!root)return;
 root.classList.add('ota43-root');root.innerHTML='<div class="ota43-loading">Loading invoice verifier…</div>';
 const s={root,id:p.id||null,mode:'overview',view:'cards',filter:'all',issue:'all',breakdown:false,offset:0,search:'',rows:[],doc:null};
 const safe=async fn=>{try{await fn()}catch(error){G.err(error)}};
 await safe(()=>render(s));
 root.addEventListener('click',event=>{
  const b=event.target.closest('[data-ota43]');if(!b||!root.contains(b))return;
  const op=b.dataset.ota43;
  safe(async()=>{
   if(op==='upload')return uploadDialog(s);
   if(op==='view'){location.hash=route(b.dataset.id);return}
   if(op==='back'){if(s.mode==='browse'){s.mode='overview';s.offset=0;await render(s)}else location.hash=route();return}
   if(op==='browse'){s.mode='browse';s.offset=0;await render(s);return}
   if(op==='filter'){s.filter=b.dataset.filter;s.offset=0;s.mode='browse';await render(s);return}
   if(op==='issue'){s.issue=b.dataset.issue;await render(s);return}
   if(op==='breakdown'){s.breakdown=!s.breakdown;await render(s);return}
   if(op==='cards'||op==='table'){s.view=op;await render(s);return}
   if(op==='next'||op==='previous'){s.offset=Math.max(0,s.offset+(op==='next'?35:-35));await render(s);return}
   if(op==='export'||op==='ticket-csv')return G.download(q('/'+s.id+'/export.csv?filter=all'),'reconciliation_redbus_'+(s.doc?.invoice_number||s.id)+'.csv');
   if(op==='original')return openSource(s.id);
   if(op==='inspect'){const id=b.dataset.line;return inspect(s,id)}
   if(op==='accept'||op==='dispute'||op==='investigate'){const row=(s.rows||[]).find(x=>x.id===b.dataset.line);if(row)return resolveDialog(s,row,op==='accept'?'accept_ota':op==='dispute'?'dispute':'investigating');return inspect(s,b.dataset.line)}
   if(op==='recheck'){await G.post(q('/'+s.id+'/recheck'));await render(s);G.toast('Reconciliation refreshed','ok');return}
   if(op==='delete'){
    const doc=s.docs?.find(x=>String(x.id)===String(b.dataset.id));
    if(!doc||!await G.confirm('Delete invoice '+doc.invoice_number+' and its PDF?',{danger:1}))return;
    await G.api('DELETE',q('/'+doc.id),{confirm:doc.invoice_number});await render(s);return;
   }
  });
 });
 let searchTimer;
 root.addEventListener('input',event=>{
  if(!event.target.matches('[data-ota43-search]'))return;
  const text=event.target.value;clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>safe(async()=>{
   s.search=text;s.offset=0;const start=document.activeElement===event.target;
   await render(s);if(start){const input=root.querySelector('[data-ota43-search]');input?.focus();input?.setSelectionRange(text.length,text.length)}
  }),280);
 });
};
})();
