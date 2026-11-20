/* JourneyOS communications and team reference UI; existing authenticated API only. */
(function () {
  'use strict';
  const safe = s => esc(String(s ?? ''));
  const q = () => G.query();
  const allowed = k => typeof can === 'function' && can(k);
  const queryLink = (base, p) => `${base}?${G.qs(p)}`;
  const err = e => G.err(e);
  const status = v => ({issue:'Issue',working:'Working',resolved:'Resolved',open:'Open',answered:'Answered',missed:'Missed',busy:'Busy',not_reachable:'Not reachable',logged:'Logged'}[String(v||'').toLowerCase()] || String(v||'Unknown'));
  const tag = v => `<span class="cap-state cap-${safe(v)}">${safe(status(v))}</span>`;
  const empty = s => `<p class="cap-empty">${safe(s)}</p>`;
  function heading(label,sub){return `<header class="cap-heading"><h2>${safe(label)}</h2><p>${safe(sub)}</p></header>`}
  function bindFilter(el,attr,cb){el.querySelectorAll(`[${attr}]`).forEach(x=>x.addEventListener('click',()=>cb(x.getAttribute(attr))))}
  async function chats(el,p){
    const f=q(), filter=f.filter||'all';
    const data=await G.get('/chats?'+G.qs({q:f.q||''}));
    const all=data.conversations||[];
    const rows=all.filter(c=>(filter==='all')||(filter==='unread'&&Number(c.unread)>0)||(filter==='blocked'&&c.blocked)||(filter==='active'&&!c.blocked));
    const current=p?.id?decodeURIComponent(p.id):null;
    el.innerHTML=`<section class="cap-wrap">${heading('Passenger conversations','WhatsApp and SMS conversation records from the authenticated messaging service')}
      <div class="cap-bar"><input data-cap-search aria-label="Search conversations" placeholder="Search name, phone or PNR" value="${safe(f.q||'')}">
      ${[['all','All'],['active','Active'],['unread','Unread'],['blocked','Blocked']].map(([v,t])=>`<button class="btn ${filter===v?'p':''}" data-cap-filter="${v}">${t}${v==='unread'?` (${Number(data.unread_total)||0})`:''}</button>`).join('')}
      </div><div class="cap-chat-layout"><div class="cap-chat-list">${rows.map(c=>`<a class="cap-chat-item ${current===c.conversation_id?'selected':''}" href="#/chats/${encodeURIComponent(c.conversation_id)}?${G.qs({filter,q:f.q||''})}"><div class="cap-chat-title"><b>${safe(c.service||'Trip')} · ${safe(c.name||'Passenger')} · ${safe(c.seat||'—')}</b>${Number(c.unread)>0?`<span class="cap-count">${Number(c.unread)}</span>`:''}</div><small>${safe(c.phone||'')} · ${safe(c.travel_date||'')} ${c.blocked?'· Blocked':''}</small><div class="cap-chat-message">${safe(c.last_message||'No messages')}</div></a>`).join('')||empty('No matching conversations')}</div><div class="cap-chat-detail" data-cap-detail>${current?'':empty('Select a conversation to see channel messages and reply')}</div></div></section>`;
    const search=el.querySelector('[data-cap-search]');search.onkeydown=e=>{if(e.key==='Enter')location.hash=queryLink('#/chats',{filter,q:search.value})};search.onchange=()=>location.hash=queryLink('#/chats',{filter,q:search.value});
    bindFilter(el,'data-cap-filter',v=>location.hash=queryLink('#/chats',{filter:v,q:search.value}));
    if(current){const meta=all.find(x=>x.conversation_id===current)||{};const pane=el.querySelector('[data-cap-detail]');await G.chatPane(pane,current,meta)}
  }
  async function calls(el){
    const f=q(), filter=f.status||'', data=await G.get('/calls?'+G.qs({q:f.q||'',status:filter}));const calls=data.calls||[];const s=data.stats||{};
    el.innerHTML=`<section class="cap-wrap">${heading('Calls','Call records, routing attempts and durations; only provider-confirmed outcomes should be treated as delivered calls')}
      <div class="cap-metrics">${[['Total',s.total],['Answered',s.answered],['Missed',s.missed],['Average duration',`${Math.round(Number(s.avg_duration)||0)} sec`]].map(([k,v])=>`<div><small>${k}</small><strong>${safe(v??0)}</strong></div>`).join('')}</div>
      <div class="cap-bar"><input data-cap-search aria-label="Search calls" placeholder="Search calls, names, PNR" value="${safe(f.q||'')}">${[['','All'],['answered','Answered'],['missed','Missed'],['not_reachable','Not reachable'],['logged','Logged']].map(([v,k])=>`<button class="btn ${filter===v?'p':''}" data-cap-status="${v}">${k}</button>`).join('')}${allowed('calls.make')?'<button class="btn p" data-cap-dial>Dial</button>':''}</div>
      <div class="cap-scroll"><table class="cap-table"><thead><tr><th>Passenger / PNR</th><th>Time</th><th>Direction</th><th>Routing</th><th>Duration</th><th>Result</th><th>Agent</th><th>Actions</th></tr></thead><tbody>${calls.map(c=>`<tr><td><b>${safe(c.passenger_name||c.name||'Unknown')}</b><small>${safe(c.phone||'')} · ${safe(c.pnr||'—')}</small></td><td>${safe(c.ts?fdt(c.ts):'—')}</td><td>${safe(c.direction||'—')}</td><td>${safe(c.kind||'—')}</td><td>${Number(c.duration_s)||0}s</td><td>${tag(c.status)}</td><td>${safe(c.agent||'—')}</td><td>${c.pnr?`<button class="btn sm" data-cap-pnr="${safe(c.pnr)}">PNR</button>`:''}${allowed('calls.make')?`<button class="btn sm" data-cap-callback="${safe(c.id)}">Call back</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8">No calls for selected filters.</td></tr>'}</tbody></table></div><p class="cap-note">Recordings, playback, download and PSTN/APP leg details are displayed only after verified provider-backed APIs are integrated. A locally logged call is not proof that a phone call connected.</p></section>`;
    const search=el.querySelector('[data-cap-search]');search.onchange=()=>location.hash=queryLink('#/calls',{q:search.value,status:filter});search.onkeydown=e=>{if(e.key==='Enter')location.hash=queryLink('#/calls',{q:search.value,status:filter})};bindFilter(el,'data-cap-status',v=>location.hash=queryLink('#/calls',{q:search.value,status:v}));
    el.querySelectorAll('[data-cap-pnr]').forEach(b=>b.onclick=()=>G.bookingModal(b.dataset.capPnr));
    el.querySelectorAll('[data-cap-callback]').forEach(b=>b.onclick=()=>{const c=calls.find(x=>String(x.id)===b.dataset.capCallback);if(c)G.callNow({phone:c.phone,name:c.passenger_name,pnr:c.pnr}).catch(err)});
    el.querySelector('[data-cap-dial]')?.addEventListener('click',async()=>{try{const v=await G.prompt('Dial a number',[{name:'phone',label:'Phone number',required:true},{name:'name',label:'Name'},{name:'pnr',label:'PNR (optional)'}],{ok:'Call'});if(v)await G.callNow(v)}catch(e){err(e)}});
  }
  // Enhance the original IAM module without bypassing authorization or replacing server-side permissions.
  const originalSettings=G.screens.settings;
  async function team(el,p){
    const tab=p.tab||'users';
    if(!['users','branches','roles'].includes(tab))return originalSettings(el,p);
    await originalSettings(el,p);
    const current=el.querySelector('[data-body]');if(!current)return;
    const active={users:'Office & bus staff',branches:'Branches',roles:'Roles'}[tab];
    const banner=document.createElement('div');banner.className='cap-team-banner';banner.innerHTML=`${heading('Team & access','Office staff, bus crew, agents, branches and permission controls')}
      <nav class="cap-team-tabs"><a href="#/settings/users" class="${tab==='users'?'active':''}">Office / bus staff</a><a href="#/settings/branches" class="${tab==='branches'?'active':''}">Branches</a><a href="#/settings/roles" class="${tab==='roles'?'active':''}">Access & roles</a></nav><p class="cap-note">${active} use authenticated IAM APIs. Company, branch and own-record restrictions must be enforced by the server on every request; a disabled UI control is not a security boundary.</p>`;
    current.parentNode.insertBefore(banner,current);
  }
  // The baseline callNow dialog claimed a cloud call was connected without a provider response.
  // This safe replacement is explicitly a manual record; status is an operator assertion.
  G.callNow=async({phone,name,pnr,kind='manual'})=>{
    if(!allowed('calls.make'))throw new Error('Not authorized to log calls');
    const v=await G.prompt('Log phone call (manual — no telephony connected)',[
      {name:'phone',label:pnr&&!phone?'Phone number (blank = booking contact)':'Phone number',required:!pnr,value:phone||''},
      {name:'name',label:'Contact name',value:name||''},
      {name:'pnr',label:'PNR',value:pnr||''},
      {name:'status',label:'Operator-reported outcome',type:'select',options:[['answered','Answered (self-reported)'],['missed','No answer'],['busy','Busy'],['not_reachable','Not reachable']]},
      {name:'duration_s',label:'Duration (seconds, if answered)',type:'number',value:0},
      {name:'notes',label:'Call notes',type:'textarea',full:1}
    ],{ok:'Save manual call record'});
    if(!v)return;
    const c=await G.post('/calls',{phone:v.phone,name:v.name,pnr:v.pnr||null,kind,status:v.status||'missed',duration_s:v.status==='answered'?Number(v.duration_s)||0:0,notes:v.notes||''});
    G.toast('Manual call record saved; no call was placed', 'ok');
    if(location.hash.startsWith('#/calls')&&G.route)G.route();
    return c;
  };
  G.screens.chats=chats;
  G.screens.calls=calls;
  G.screens.settings=team;
})();
