(function(){
  'use strict';
  const fmt=x=>'₹'+Number(x||0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sourceOptions=['','Cash','Bank','Office','Driver','Helper','Agent','Other'];
  const paths={
    bus:'M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M7 17v3m10-3v3',
    cost:'M3 5h18v15H3zM3 9h18M16 15h3', fuel:'M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M4 11h11M15 7h3l3 4v7',
    pin:'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    user:'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z',
    shield:'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', doc:'M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7',
    staff:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-15a4 4 0 0 1 0 8',
    toll:'M3 12h18m-7-7 7 7-7 7', wheel:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    percent:'M5 19 19 5M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    trend:'M3 17l6-6 4 4 8-9m-5 0h5v5',print:'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 15h12v6H6z',
    plus:'M12 5v14M5 12h14', chevron:'m6 9 6 6 6-6',x:'M18 6 6 18M6 6l12 12',receipt:'M4 3h16v18l-4-2-4 2-4-2-4 2Z M8 9h8M8 13h8'
  };
  const ic=(key,size=19)=>`<svg class="sxp-ic" width="${size}" height="${size}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><path d="${paths[key]||paths.doc}"/></svg>`;
  const date=v=>{const d=new Date(v+'T12:00:00');return Number.isNaN(d.getTime())?v:d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});};
  const icoFor=x=>/insurance/i.test(x)?'shield':/permit|clean/i.test(x)?'doc':/salary|driver|helper/i.test(x)?'staff':/toll/i.test(x)?'toll':/tyre/i.test(x)?'wheel':/commission/i.test(x)?'percent':/diesel|fuel/i.test(x)?'fuel':'cost';
  let draft=null, seq=0;
  const reset=()=>{draft=null;};
  function init(p){
    if(draft&&String(draft.sid)===String(p.schedule_id)&&draft.version===(p.expense_version||0))return;
    const items=p.expense_breakdown?.items||[];
    draft={sid:p.schedule_id,version:p.expense_version||0,original:p,open:null,dirty:false,saving:false,
      route:items.filter(x=>!x.manual).map(x=>({key:x.edit_key,label:x.label||x.key||'Other',type:x.type,amount:String(x.per_day??0),defaultAmount:Number(x.original??x.per_day??0),source:x.source||''})),
      manual:items.filter(x=>x.manual).map(x=>({key:'manual:'+x.id,id:x.id,label:x.label||'Other',type:x.type,amount:String(x.per_day??0),source:x.source||''}))};
  }
  const all=()=>[...draft.route,...draft.manual];
  const lookup=key=>all().find(x=>x.key===key);
  function totals(){
    const sum=type=>all().filter(r=>r.type===type).reduce((n,r)=>n+(Number(r.amount)||0),0);
    const fixed=sum('fixed'),running=sum('running')+Number(draft.original.commission||0);
    const expense=fixed+running,income=Number(draft.original.net_sales||0)+Number(draft.original.cancellation_charges||0),profit=income-expense;
    return {fixed,running,expense,income,profit,margin:income?profit/income*100:0};
  }
  function dirty(){
    if(!draft)return false;
    const old=draft.original.expense_breakdown?.items||[],route=old.filter(x=>!x.manual),manual=old.filter(x=>x.manual);
    draft.dirty=draft.route.some((r,i)=>Number(r.amount)!==Number(route[i]?.per_day||0)||r.source!==(route[i]?.source||''))||
      draft.manual.length!==manual.length||draft.manual.some((r,i)=>!manual[i]||Number(r.id)!==Number(manual[i].id)||
        r.label!==manual[i].label||r.type!==manual[i].type||Number(r.amount)!==Number(manual[i].per_day)||r.source!==(manual[i].source||''));
    return draft.dirty;
  }
  const invalid=()=>all().some(r=>r.amount===''||!Number.isFinite(Number(r.amount))||Number(r.amount)<0||Number(r.amount)>100000000||(r.id!==undefined&&!r.label.trim()));
  const from=r=>`<select data-sxp-source="${esc(r.key)}" aria-label="Funding source for ${esc(r.label)}">${sourceOptions.map(s=>`<option value="${esc(s)}" ${r.source===s?'selected':''}>${s||'From'}</option>`).join('')}</select>`;
  function expenseRow(r){
    const open=draft.open===r.key,manual=r.id!==undefined;
    return `<div class="sxp-item ${open?'expanded':''}" data-sxp-item="${esc(r.key)}"><div class="sxp-row">
      <span class="sxp-row-icon ${r.type}">${ic(icoFor(r.label),21)}</span>
      <button type="button" class="sxp-name" data-sxp-open="${esc(r.key)}" aria-expanded="${open}"><span>${esc(r.label)}</span>${ic('chevron',17)}</button>
      <label class="sxp-amount"><b>₹</b><input type="number" min="0" max="100000000" step=".01" data-sxp-amount="${esc(r.key)}" value="${esc(r.amount)}" aria-label="${esc(r.label)} amount"></label>
      <span class="sxp-from">${from(r)}</span></div>
      ${open?`<div class="sxp-detail">${manual?`<label>Expense name<input maxlength="80" data-sxp-label="${esc(r.key)}" value="${esc(r.label)}" placeholder="Expense name"></label><label>Category<select data-sxp-type="${esc(r.key)}"><option value="fixed" ${r.type==='fixed'?'selected':''}>Fixed</option><option value="running" ${r.type==='running'?'selected':''}>Running</option></select></label>`:`<span>Route default: ${fmt(r.defaultAmount)} · override applies only to this trip</span>`}
      <div class="sxp-row-menu">${manual?'':`<button type="button" data-sxp-reset="${esc(r.key)}">Restore default</button>`}<button type="button" data-sxp-delete="${esc(r.key)}">${manual?'Delete expense':'Set amount to ₹0'}</button></div></div>`:''}</div>`;
  }
  const staff=d=>(d.crew||[]).map(c=>`<div class="sxp-staff"><i>${ic(/helper/i.test(c.role||'')?'staff':'user',19)}</i><div><small>${esc(c.role||'Staff')}</small><b>${esc(c.name||'Unassigned')}</b></div>${c.phone?`<a href="tel:${esc(String(c.phone).replace(/[^0-9+]/g,''))}">${ic('phone',15)} ${esc(c.phone)}</a>`:''}</div>`).join('');
  function render({p,detail,canEdit}){
    init(p);const t=totals(),writable=canEdit&&detail.status==='active',noOverrides=!draft.manual.length&&draft.route.every(r=>Number(r.amount)===r.defaultAmount);
    const list=type=>all().filter(r=>r.type===type).map(expenseRow).join('');
    const incomeChannels=(p.by_channel||[]).map(x=>`<div class="sxp-income-row"><span>${esc(x.channel)}</span><span>${Number(x.seats||0)}</span><b>${fmt(x.net)}</b></div>`).join('');
    return `<div class="sxp-v18" data-sxp-writable="${writable}">
    <div class="sxp-banner"><div class="sxp-banner-title"><strong><i>${ic('bus',24)}</i> TRIP P&L</strong><div><span class="sxp-route-status">● ${noOverrides?'Route defaults':'Trip overrides'}</span><button data-sxp-print type="button">${ic('print',19)} Print</button></div></div>
    <div class="sxp-chips">
      <div class="sxp-chip"><i class="blue">#</i><small>SERVICE</small><b>${esc(detail.service_number||p.service)}</b><span>· ${esc(detail.service_name||'')}</span></div>
      <div class="sxp-chip"><i class="green">${ic('pin',17)}</i><small>ROUTE</small><b>${esc(p.route)}</b></div>
      <div class="sxp-chip"><i class="orange">${ic('calendar',16)}</i><small>DOJ</small><b>${esc(date(p.date))}</b></div>
      <div class="sxp-chip"><i class="cyan">${ic('bus',18)}</i><small>BUS</small><b>${esc(detail.vehicle?.registration_number||p.vehicle||'Unassigned')}</b><span>· ${esc(detail.coach||'')}</span></div>
    </div><div class="sxp-staff-list">${staff(detail)||'<span>Vehicle crew not yet assigned</span>'}</div></div>
    <div class="sxp-body-grid"><section class="sxp-cost-pane"><div class="sxp-expense-columns">
      <section class="sxp-expense-group fixed"><header><div><i>${ic('cost',23)}</i><b>Fixed Expenses</b></div><strong data-sxp-total="fixed">${fmt(t.fixed)}</strong></header>
        <div class="sxp-items">${list('fixed')}</div><button class="sxp-add" data-sxp-add="fixed" type="button">${ic('plus',19)} Add</button>
      </section>
      <section class="sxp-expense-group running"><header><div><i>${ic('fuel',23)}</i><b>Running Expenses</b></div><strong data-sxp-total="running">${fmt(t.running)}</strong></header>
        <div class="sxp-items">${list('running')}<div class="sxp-row sxp-auto-row"><span class="sxp-row-icon running">${ic('percent',20)}</span><div class="sxp-name">Commissions <small>Auto</small></div><label class="sxp-amount"><b>₹</b><input readonly value="${esc(p.commission||0)}" aria-label="Booking commissions"></label><span class="sxp-from">Auto</span></div></div><button class="sxp-add" data-sxp-add="running" type="button">${ic('plus',19)} Add</button>
      </section></div>
      <div class="sxp-cost-footer"><div><span><i class="fixed"></i>Subtotal — Fixed</span><b data-sxp-total="fixed">${fmt(t.fixed)}</b></div><div><span><i class="running"></i>Subtotal — Running</span><b data-sxp-total="running">${fmt(t.running)}</b></div>
      <div class="sxp-cost-total"><span>${ic('receipt',21)} TOTAL EXPENSES</span><b data-sxp-total="expense">${fmt(t.expense)}</b></div></div></section>
    <aside class="sxp-revenue"><header><strong><i>${ic('trend',20)}</i> INCOME</strong><span>${Number(p.seats||0)} seats</span></header>
      <div class="sxp-income-lines">${incomeChannels||'<p>No confirmed sales for this schedule</p>'}${p.cancellation_charges?`<div class="sxp-income-row"><span>Cancellation charges</span><span>—</span><b>${fmt(p.cancellation_charges)}</b></div>`:''}</div>
      <div class="sxp-income-total"><b>TOTAL INCOME</b><strong>${fmt(t.income)}</strong></div>
      <section class="sxp-profit ${t.profit<0?'loss':''}"><div><strong>${ic('trend',20)} NET PROFIT</strong><span data-sxp-total="margin">${t.margin>=0?'+':''}${Math.round(t.margin)}%</span></div><h2 data-sxp-total="profit">${fmt(t.profit)}</h2>
      <div class="sxp-profit-labels"><span>Income</span><span>Expenses</span></div>
      <div class="sxp-track"><i data-sxp-track style="width:${t.income?Math.min(100,t.expense/t.income*100):0}%"></i></div>
      <div class="sxp-profit-nums"><span>${fmt(t.income)}</span><span data-sxp-total="expense">${fmt(t.expense)}</span></div></section>
      <div class="sxp-revenue-details"><div><span>GST on bookings (informational)</span><b>${fmt(p.gst)}</b></div><div><span>Commissions included in expenses</span><b>${fmt(p.commission)}</b></div><div><span>Occupancy</span><b>${Number(p.seats||0)}/${Number(p.capacity||0)}</b></div></div>
    </aside></div>${!writable?'<p class="sxp-readonly">Expenses are read-only for this account or disabled schedule.</p>':''}</div>`;
  }
  function decorate(overlay,canEdit){
    const f=overlay?.querySelector('.sx-modal-footer');if(!f)return;
    f.innerHTML=`<span class="sxp-help" data-sxp-help></span><div class="sxp-buttons"><button class="sxp-close" data-sx-close type="button">${ic('x',19)} Close</button><button class="sxp-save" data-sxp-save type="button" disabled>Save Expenses</button><span class="sxp-caution">!</span></div>`;
    update(overlay);
  }
  function update(overlay){
    if(!draft||!overlay)return;dirty();const t=totals();
    for(const k of ['fixed','running','expense','profit','margin'])for(const el of overlay.querySelectorAll(`[data-sxp-total="${k}"]`))el.textContent=k==='margin'?`${t.margin>=0?'+':''}${Math.round(t.margin)}%`:fmt(t[k]);
    const bar=overlay.querySelector('[data-sxp-track]');if(bar)bar.style.width=`${t.income?Math.max(0,Math.min(100,t.expense/t.income*100)):0}%`;
    overlay.querySelector('.sxp-profit')?.classList.toggle('loss',t.profit<0);
    const b=overlay.querySelector('[data-sxp-save]');if(b)b.disabled=!draft.dirty||invalid()||draft.saving||!overlay.querySelector('[data-sxp-writable="true"]');
    const h=overlay.querySelector('[data-sxp-help]');if(h)h.textContent=invalid()?'Correct expense values and descriptions before saving':draft.dirty?'Unsaved changes • this schedule only':'All expenses saved • route unchanged';
  }
  async function confirmLeave(ctx){return !dirty()||Boolean(await ctx.api.confirm('Discard unsaved P&L expenses?',{ok:'Discard',danger:1}));}
  async function save(ctx){
    if(!dirty()||invalid()||draft.saving||!ctx.canEdit)return;
    draft.saving=true;update(ctx.overlay);
    try{
      const res=await ctx.api.put(`/schedules/${encodeURIComponent(draft.sid)}/pnl-expenses`,{
        expected_version:draft.version,
        overrides:Object.fromEntries(draft.route.map(r=>[r.key,Number(r.amount)])),
        sources:Object.fromEntries(draft.route.filter(r=>r.source).map(r=>[r.key,r.source])),
        manual:draft.manual.map(r=>({id:r.id??null,label:r.label,type:r.type,amount:Number(r.amount),source:r.source}))
      });
      reset();ctx.setPnl(res);ctx.api.toast('Expenses saved; P&L recalculated','ok');await ctx.redraw();
    }catch(e){ctx.api.toast(e.message||'Unable to save expenses','bad');throw e;}
    finally{if(draft){draft.saving=false;update(ctx.overlay)}}
  }
  async function click(b,ctx){
    const d=b.dataset;
    if('sxpPrint'in d){window.print();return true;}
    if('sxpSave'in d){await save(ctx);return true;}
    if('sxpOpen'in d){draft.open=draft.open===d.sxpOpen?null:d.sxpOpen;await ctx.redraw();return true;}
    if('sxpAdd'in d){if(!ctx.canEdit)return true;const key='new:'+ ++seq;draft.manual.push({key,label:'New expense',type:d.sxpAdd,amount:'0',source:''});draft.open=key;await ctx.redraw();ctx.overlay.querySelector(`[data-sxp-label="${key}"]`)?.focus();return true;}
    if('sxpDelete'in d){if(!ctx.canEdit)return true;const r=lookup(d.sxpDelete);if(r){if(r.id!==undefined)draft.manual=draft.manual.filter(x=>x.key!==r.key);else r.amount='0';draft.open=null;await ctx.redraw();}return true;}
    if('sxpReset'in d){const r=lookup(d.sxpReset);if(r&&ctx.canEdit){r.amount=String(r.defaultAmount);r.source='';draft.open=null;await ctx.redraw();}return true;}
    return false;
  }
  async function change(x,ctx){
    if(!draft||!ctx.canEdit)return false;
    const key=x.dataset.sxpSource||x.dataset.sxpType;const field=x.hasAttribute('data-sxp-source')?'source':x.hasAttribute('data-sxp-type')?'type':null;if(!field)return false;
    const r=lookup(key);if(r){r[field]=x.value;if(field==='type')await ctx.redraw();else update(ctx.overlay);}return true;
  }
  function input(x,ctx){
    if(!draft||!ctx.canEdit)return false;
    const field=x.hasAttribute('data-sxp-amount')?'amount':x.hasAttribute('data-sxp-label')?'label':null;if(!field)return false;
    const key=x.dataset[field==='amount'?'sxpAmount':'sxpLabel'],r=lookup(key);if(r){r[field]=x.value;update(ctx.overlay);}return true;
  }
  window.SchedulePnlV18={reset,render,decorate,click,change,input,confirmLeave,dirty,save};
})();
