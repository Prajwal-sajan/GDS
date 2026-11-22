(function(){
'use strict';
if(!window.G?.screens?.accounts||window.__invoicesV24)return;
const previous=G.screens.accounts;window.__invoicesV24=true;
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inMoney=x=>x===null||x===undefined?'—':'₹'+Number(x).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const titleMonth=m=>{const date=new Date(m+'-01T12:00:00');return Number.isNaN(date.getTime())?m:date.toLocaleDateString('en-GB',{month:'long',year:'numeric'}).toUpperCase()};
const path='/accounts/invoices-v24';
const icons={
 wallet:'M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0-3 3v13a2 2 0 0 0 2 2h16V7Zm0 5h-6a2 2 0 0 0 0 4h6',
 refresh:'M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6m-5 4a8 8 0 0 0 14 5l3-3m0 6v-6h-6',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
 file:'M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 0v6h6M9 12h6m-6 4h6',
 archive:'M3 4h18v4H3zm2 4h14v13H5zm5 4h4',
 plus:'M12 4v16M4 12h16',
 upload:'M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4',
 close:'M18 6 6 18M6 6l12 12',
 pay:'M2 8h20M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 shield:'M12 2 4 5v6c0 5 3.7 9 8 11 4.3-2 8-6 8-11V5zM8 12l3 3 5-6'
};
const ico=(k,n=20)=>`<svg width="${n}" height="${n}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[k]}"/></svg>`;
const button=(label,action,cls='',props='')=>`<button type="button" class="inv24-button ${cls}" data-inv24="${action}" ${props}>${label}</button>`;
const nameAttr=x=>`data-key="${e(x.key)}"`;
const cols={
 tax:['Description','Rate','Qty','Taxable','Total'],
 metro:['Date','PNR','Service','Metro','Passenger Station','Exchange Point','Pax','Fare/Pax','Fare'],
 cloud:['Date','Time','From','To','Duration','Charge'],
 ai:['Date','Time','From','To','Duration','Charge'],
 chat:['Messages','Count','Rate / message','Amount'],
 platform:['Travel date','Booked on','Channel','PNR','Status','Sales','Offer','Net fare','Commission','GST on comm.','Canc. charge'],
 operator:['Date','Type','Particulars','Deducted / Paid','Collected','Balance','Reference']
};
const fields={
 tax:['description','rate','qty','taxable','total'],
 metro:['date','pnr','service','metro','passenger_station','exchange_point','pax','fare_per_pax','fare'],
 cloud:['date','time','from','to','duration','charge'],
 ai:['date','time','from','to','duration','charge'],
 chat:['label','count','rate','amount'],
 platform:['travel_date','booked_on','channel','pnr','status','sales','offer','net_fare','commission','gst_on_commission','cancellation_charge'],
 operator:['date','type','particulars','deducted','collected','balance','reference']
};
function dataTable(type,rows){
 const heads=cols[type]||Object.keys(rows?.[0]||{});
 const keys=fields[type]||heads;
 if(!rows?.length)return '<p class="inv24-no-rows">No source-backed line items have been imported.</p>';
 return `<div class="inv24-table-scroll"><table class="inv24-table"><thead><tr>${heads.map(x=>`<th>${e(x)}</th>`).join('')}</tr></thead>
 <tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${e(r[k]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function previewSummary(doc,snapshot){
 let sections=[];
 if(doc.type==='tax'){
  if(snapshot.line_items?.length)sections.push(['Invoice line items',dataTable('tax',snapshot.line_items)]);
  if(snapshot.totals)sections.push(['Tax summary',Object.entries(snapshot.totals).map(([k,v])=>`<div class="inv24-balance-detail"><span>${e(k.replaceAll('_',' '))}</span><strong>${inMoney(v)}</strong></div>`).join('')]);
 }else if(doc.type==='metro'){
  if(snapshot.summary_rows?.length)sections.push(['Metro operators',dataTable('metro',snapshot.summary_rows.map(x=>({...x,passenger_station:x.city,exchange_point:x.billing_basis,fare:x.metro_fares})))]);
  sections.push(['Ticket-level detail',dataTable('metro',snapshot.lines)]);
 }else if(doc.type==='operator'){
  if(snapshot.summary_rows?.length)sections.push(['Statement summary',snapshot.summary_rows.map(r=>`<div class="inv24-balance-detail"><span>${e(r.label)}</span><strong>${inMoney(r.amount)}</strong></div>`).join('')]);
  sections.push(['Running statement ledger',dataTable('operator',snapshot.ledger)]);
 }else if(doc.type==='chat')sections.push(['Message charges',dataTable('chat',snapshot.summary_rows)]);
 else if(doc.type==='platform'){
  if(snapshot.channel_summary?.length)sections.push(['Website / Paytm / Offline',dataTable('platform',snapshot.channel_summary)]);
  sections.push(['Booking and cancellation lines',dataTable('platform',snapshot.lines)]);
 }else sections.push(['Call details',dataTable(doc.type,snapshot.lines)]);
 if(snapshot.notes?.length)sections.push(['Notes','<ol>'+snapshot.notes.map(x=>`<li>${e(x)}</li>`).join('')+'</ol>']);
 return sections.map(([heading,body])=>`<section class="inv24-preview-section"><h3>${e(heading)}</h3>${body}</section>`).join('');
}
function docActions(doc){
 return `<div class="inv24-row-actions">
 ${button(`${ico('eye',17)} View`,'view','quiet',nameAttr(doc))}
 ${button(`${ico('download',18)} PDF`,'pdf','textlink',nameAttr(doc))}
 ${!doc.has_pdf?button(`${ico('upload',15)} Import PDF`,'upload','muted',nameAttr(doc)):''}
 </div>`;
}
function render(root,state){
 const data=state.data,bal=data.balance||{},docs=(data.documents||[]).filter(x=>
 (state.type==='all'||x.type===state.type)&&(state.year==='all'||x.period_month?.startsWith(state.year)));
 const grouped={};for(const x of docs)(grouped[x.period_month]??=[]).push(x);
 const canPay=(bal.payable_by_operator||0)>0;
 const heading=bal.closing_balance===null?'No statement balance':bal.closing_balance<0?'Payable by operator':'Payable to operator';
 root.innerHTML=`<div class="inv24-root">
 <div class="inv24-outstanding">
  <div class="inv24-wallet">${ico('wallet',28)}</div>
  <div class="inv24-outstanding-main"><div class="inv24-eyebrow">OUTSTANDING BALANCE</div>
    <h2>${inMoney(bal.payable_by_operator??0)}</h2>
    <p>As per Operator Statement <span>${e(bal.statement||'—')}</span>
     ${bal.statement_key?button('View','current-view','inline-link'):''}</p>
    <small>${e(heading)}${bal.closing_balance!==null?' · Signed statement balance '+inMoney(bal.closing_balance):''}
      ${bal.pending_payments?' · '+bal.pending_payments+' payment reference(s) awaiting verification':''}</small></div>
  <div class="inv24-outstanding-actions">${button(`${ico('refresh')} Refresh`,'refresh','outline')}${button(`${ico('pay')} Pay`,'pay','primary')}</div>
 </div>
 <div class="inv24-toolbar">
   <label><select name="inv24-type" aria-label="Filter invoice type"><option value="all">All types</option>
    ${(data.types||[]).map(x=>`<option value="${e(x.id)}" ${state.type===x.id?'selected':''}>${e(x.label)}</option>`).join('')}
   </select></label>
   <label><select name="inv24-year" aria-label="Filter invoice year"><option value="all">All years</option>
    ${(data.years||[]).map(y=>`<option value="${e(y)}" ${state.year===y?'selected':''}>${e(y)}</option>`).join('')}</select></label>
   ${button(`${ico('plus',17)} Add document`,'new','subtle')}
   <div class="inv24-spacer"></div>
   <div class="inv24-current">${ico('file',19)} Current statement</div>
   ${button(`${ico('eye',18)} View`,'current-view','quiet',!bal.statement_key?'disabled':'')}
   ${button(`${ico('download',18)} PDF`,'current-pdf','textlink',!bal.statement_key?'disabled':'')}
 </div>
 <div class="inv24-month-list">${Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,items])=>`
  <section class="inv24-month"><header><span>${e(titleMonth(month))}</span><div class="inv24-month-tools">
    ${button(`Reconcile`,'reconcile','subtle',`data-month="${e(month)}"`)}
    ${button(`${ico('archive',16)} Download all`,'all','textlink',`data-month="${e(month)}"`)}
   </div></header>
   ${items.map(doc=>`<div class="inv24-row"><strong>${e(doc.label)}${doc.is_reference?' <small class="inv24-reference">Reference only</small>':''}</strong><span class="inv24-code">${e(doc.name||'—')}</span>
    ${docActions(doc)}</div>`).join('')}
  </section>`).join('')||'<div class="inv24-empty">No invoices or statements for these filters.</div>'}</div>
 <p class="inv24-footnote">PDF downloads preserve the original uploaded statement. Charges, settlement balances, GST and payment status are never fabricated from missing provider records.</p>
 <input type="file" accept="application/pdf,.pdf" data-inv24-file hidden>
 <div class="inv24-overlay-container" data-inv24-overlays></div>
 </div>`;
 root.querySelector('[name=inv24-type]').onchange=ev=>{state.type=ev.target.value;render(root,state)};
 root.querySelector('[name=inv24-year]').onchange=ev=>{state.year=ev.target.value;render(root,state)};
}
function closeModal(root){
 const overlay=root.querySelector('.inv24-overlay-container');if(overlay){overlay.innerHTML='';}
 if(root.__inv24Blob){URL.revokeObjectURL(root.__inv24Blob);root.__inv24Blob=null;}
}
function dialog(root,title,content,wide=false){
 closeModal(root);
 const overlay=root.querySelector('.inv24-overlay-container');
 overlay.innerHTML=`<div class="inv24-scrim" data-inv24="close"></div>
 <section role="dialog" aria-modal="true" aria-label="${e(title)}" class="inv24-dialog ${wide?'wide':''}">
  <header><h2>${e(title)}</h2>${button(ico('close',21),'close','icon')}</header>
  <div class="inv24-dialog-body">${content}</div>
 </section>`;
 overlay.querySelector('[role=dialog]').tabIndex=-1;overlay.querySelector('[role=dialog]').focus();
}
const headers=()=>{const h={};const token=localStorage.getItem('token');if(token)h.Authorization='Bearer '+token;if(G.viewAs)h['x-view-as']=G.viewAs;return h;};
async function fetchPdf(key,download=false){
 const res=await fetch('/api'+path+'/documents/'+encodeURIComponent(key)+'/pdf'+(download?'?download=1':''),{headers:headers()});
 if(!res.ok){const j=await res.json().catch(()=>null);throw Error(j?.message||'PDF unavailable');}
 return await res.blob();
}
async function saveBlob(blob,file){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
async function showDoc(root,key){
 const d=await G.get(path+'/documents/'+encodeURIComponent(key)),doc=d.document;
 if(doc.has_pdf){
   const blob=await fetchPdf(key);const url=URL.createObjectURL(blob);
   dialog(root,doc.label+' · '+doc.name,`<iframe title="${e(doc.label)}" class="inv24-pdf-frame" src="${url}"></iframe>
   <p class="inv24-document-hint">${doc.is_reference?'Reference-only document · excluded from settlement · ':'Original issued document · '}SHA-256 verified · ${e(doc.original_filename||'PDF')}</p>`,true);
   root.__inv24Blob=url;
 }else{
   const snapshot=d.snapshot;
   dialog(root,doc.label+' · '+doc.name,`<div class="inv24-document-summary">
   <div class="inv24-summary-grid">
    <div><small>Reference</small><b>${e(doc.name)}</b></div><div><small>Statement month</small><b>${e(titleMonth(doc.period_month))}</b></div>
    <div><small>Document date</small><b>${e(doc.document_date)}</b></div><div><small>Recorded amount</small><b>${inMoney(doc.amount)}</b></div>
   </div>${snapshot?previewSummary(doc,snapshot):'<p class="inv24-unavailable">This is a catalogue entry only. A provider-issued PDF or verified source statement has not been imported. No replacement invoice has been fabricated.</p>'}
   ${button(`${ico('upload',17)} Import original PDF`,'upload','primary',nameAttr(doc))}
   </div>`,true);
 }
}
async function pdfAction(root,key){
 const doc=(root.__inv24State.data.documents||[]).find(d=>d.key===key);
 if(!doc)throw Error('Document not found');
 if(!doc.has_pdf){await showDoc(root,key);return;}
 await saveBlob(await fetchPdf(key,true),doc.name.replace(/[/\\]/g,'-')+'.pdf');
 G.toast('Verified original PDF downloaded','ok');
}
async function reconcile(root,month){
 const d=await G.get(path+'/reconcile/'+encodeURIComponent(month));
 const status=x=>x==='match'?'Verified':x==='mismatch'?'Mismatch':x==='missing'?'Insufficient evidence':'Informational';
 dialog(root,'Statement reconciliation · '+titleMonth(month),`
 <p class="inv24-document-hint">Source evidence checks: ${e(d.summary.matched)} match · ${e(d.summary.mismatched)} mismatches · ${e(d.summary.insufficient_evidence)} require source records.</p>
 <div class="inv24-table-scroll"><table class="inv24-table inv24-recon-table">
 <thead><tr><th>Validation</th><th>Source A</th><th>Source B</th><th>Difference</th><th>Status</th></tr></thead>
 <tbody>${d.checks.map(x=>`<tr><td><b>${e(x.label)}</b><small>${e(x.explanation||'')}</small></td>
 <td>${x.left===null?'—':inMoney(x.left)}</td><td>${x.right===null?'—':inMoney(x.right)}</td>
 <td>${x.difference===null?'—':inMoney(x.difference)}</td>
 <td><span class="inv24-audit-status ${e(x.status)}">${status(x.status)}</span></td></tr>`).join('')}</tbody></table></div>
 <p class="inv24-document-hint">Original PDFs are preserved as-is. Automatic reconciliation requires typed source records; it will not infer an amount from an uploaded PDF alone.</p>`,true);
}
async function allAction(root,month){
 const res=await fetch('/api'+path+'/bundle/'+encodeURIComponent(month),{headers:headers()});
 if(!res.ok){const j=await res.json().catch(()=>null);throw Error(j?.message||'Monthly download is unavailable');}
 await saveBlob(await res.blob(),'invoices_'+month+'.zip');
 G.toast('Monthly PDF archive downloaded','ok');
}
async function upload(root,key){
 const input=root.querySelector('[data-inv24-file]');
 input.value='';input.dataset.doc=key;input.click();
}
function bytesToB64(array){
 const out=[];for(let i=0;i<array.length;i+=0x4000)out.push(String.fromCharCode(...array.subarray(i,i+0x4000)));
 return btoa(out.join(''));
}
async function addDocument(root){
 const s=root.__inv24State,defaultMonth=new Date().toISOString().slice(0,7);
 dialog(root,'Add invoice or statement',`<form data-inv24-new class="inv24-form">
 <label>Document type<select name="type">${s.data.types.map(x=>`<option value="${e(x.id)}">${e(x.label)}</option>`).join('')}</select></label>
 <label>Document reference<input name="name" placeholder="e.g. PSS-2026-00091" required maxlength="80"></label>
 <label>Period month<input type="month" name="month" value="${defaultMonth}" required></label>
 <label>Document date<input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></label>
 <label>Purpose<select name="reference_only"><option value="true">Reference only — not included in settlement</option><option value="false">Operational — auditable statement data required</option></select></label>
 <label>Verified statement data (JSON, optional for reference-only documents)<textarea name="snapshot" rows="4" placeholder='{"opening_balance":0,"ledger":[],"posted_closing_balance":0}'></textarea></label>
 <p>Use the number on the original issued document. This creates a catalogue record only, not a tax invoice or financial transaction.</p>
 <button type="submit" class="inv24-button primary">Add document</button></form>`);
}
async function payDialog(root){
 const bal=root.__inv24State.data.balance||{};
 if(!(bal.payable_by_operator>0)){
   dialog(root,'No payment due',`<p class="inv24-unavailable">There is no verified amount payable by the operator on the current statement. A positive signed statement balance is payable to the operator, not a bill to pay.</p>`);
   return;
 }
 dialog(root,'Payment reference',`<form data-inv24-pay class="inv24-form">
 <p>Payable by operator: <strong>${inMoney(bal.payable_by_operator)}</strong></p>
 <label>Amount (₹)<input name="amount" required type="number" min=".01" max="${e(bal.payable_by_operator)}" step=".01" value="${e(bal.payable_by_operator)}"></label>
 <label>Bank UTR/reference<input name="reference" required minlength="5" maxlength="120"></label>
 <p>Records the payment reference as <strong>pending verification</strong>. This does not initiate a transfer or reduce the signed statement balance.</p>
 <button type="submit" class="inv24-button primary">Submit reference</button></form>`);
}
async function refresh(root){
 const s=root.__inv24State;s.data=await G.get(path);
 render(root,s);
}
async function action(root,evt){
 const b=evt.target.closest('[data-inv24]');if(!b||b.disabled)return;
 const op=b.dataset.inv24,key=b.dataset.key,month=b.dataset.month;
 if(op==='close'){closeModal(root);return;}
 if(op==='new'){await addDocument(root);return;}
 if(op==='refresh'){await refresh(root);return;}
 if(op==='pay'){await payDialog(root);return;}
 if(op==='upload'){await upload(root,key);return;}
 if(op==='view'){await showDoc(root,key);return;}
 if(op==='pdf'){await pdfAction(root,key);return;}
 if(op==='all'){await allAction(root,month);return;}
 if(op==='reconcile'){await reconcile(root,month);return;}
 if(op==='current-view'||op==='current-pdf'){
  const d=root.__inv24State.data.balance;
  if(!d.statement_key)throw Error('No operator statement is available');
  if(op==='current-view')await showDoc(root,d.statement_key);else await pdfAction(root,d.statement_key);
 }
}
async function wire(root){
 root.addEventListener('click',evt=>{const b=evt.target.closest('[data-inv24]');if(b)action(root,evt).catch(G.err)});
 root.addEventListener('change',async evt=>{
  if(!evt.target.matches('[data-inv24-file]'))return;
  const file=evt.target.files?.[0],key=evt.target.dataset.doc;if(!file)return;
  if(file.size>12*1024*1024){G.toast('PDF must be 12 MB or smaller','bad');return;}
  try{
   const base64=bytesToB64(new Uint8Array(await file.arrayBuffer()));
   await G.post(path+'/documents/'+encodeURIComponent(key)+'/pdf',{base64,filename:file.name});
   G.toast('Original PDF verified and imported','ok');closeModal(root);await refresh(root);
  }catch(e){G.err(e);}
 });
 root.addEventListener('submit',async evt=>{
  const f=evt.target;
  if(f.matches('[data-inv24-new]')){
   evt.preventDefault();const body=Object.fromEntries(new FormData(f));
   body.reference_only=body.reference_only!=='false';
   try{if(body.snapshot?.trim())body.snapshot=JSON.parse(body.snapshot);else delete body.snapshot;
   await G.post(path+'/documents',body);closeModal(root);await refresh(root);G.toast('Document added; import its original PDF next','ok');}
   catch(e){G.err(e);}
  }else if(f.matches('[data-inv24-pay]')){
   evt.preventDefault();const body=Object.fromEntries(new FormData(f));
   try{await G.post(path+'/payments',body);closeModal(root);await refresh(root);G.toast('Payment UTR pending verification','ok');}
   catch(e){G.err(e);}
  }
 });
 root.addEventListener('keydown',evt=>{if(evt.key==='Escape')closeModal(root)});
}
G.screens.accounts=async function(el,p={}){
 if(p.tab!=='invoices')return previous(el,p);
 await previous(el,p);
 const root=el.querySelector('[data-ac10-page]');if(!root)return;
 if(!can('accounts.ledger')){
  root.innerHTML='<div class="inv24-access">Invoice statements and financial account documents require the Accounts Ledger permission.</div>';
  return;
 }
 try{
  const state={data:await G.get(path),type:'all',year:'all'};
  root.__inv24State=state;render(root,state);wire(root);
 }catch(err){root.innerHTML='<div class="inv24-access">'+e(err.message)+'</div>';G.err(err);}
};
window.InvoicesV24={render,titleMonth};
})();
