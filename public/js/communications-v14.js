/* SaveTrip screenshot-faithful Chats & Calls UX v14.
   Adds UI to the existing GDS; requires pre-existing authenticated /api/chats and /api/calls.
   IMPORTANT: No WhatsApp/PSTN telephony integration or recording service is implied. */
(function () {
  'use strict';
  if (!window.G || !G.screens || G.__communicationsV14) return;
  G.__communicationsV14 = true;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const E = x => esc(String(x ?? ''));
  const authorized = p => typeof can === 'function' && can(p);
  const icoPaths = {
    'plus':'M12 5v14M5 12h14','search':'m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    'eye-off':'M3 3l18 18M10.58 10.59a2 2 0 0 0 2.83 2.83M9.88 5.1A10.9 10.9 0 0 1 12 4c5 0 9.27 3.11 11 8a11.8 11.8 0 0 1-4.05 5.3M6.04 6.05A11.6 11.6 0 0 0 1 12c1.73 4.89 6 8 11 8a11.2 11.2 0 0 0 4.6-.98',
    'flag':'M4 22V4m0 1c4-3 7 3 12 0v11c-5 3-8-3-12 0','chat':'M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.5-1.2L3 20l1.2-5A8.5 8.5 0 1 1 21 11.5Z',
    'phone':'M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.7 19.7 0 0 1 2.11 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72l.36 2.75a2 2 0 0 1-.57 1.71L7.7 9.4a16 16 0 0 0 6.9 6.9l1.23-1.2a2 2 0 0 1 1.7-.57l2.75.36A2 2 0 0 1 22 16.9Z',
    'phone-in':'m6 6 7 7M6 6v6M6 6h6M20 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.2 12a19.7 19.7 0 0 1-3.08-8 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.72',
    'phone-out':'m7 12 7-7M8 5h6v6M21 17v3a2 2 0 0 1-2 2A19 19 0 0 1 2 5a2 2 0 0 1 2-2h3',
    'chevron':'m6 9 6 6 6-6','x':'M18 6 6 18M6 6l12 12','block':'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2',
    'send':'m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13','clip':'m21.44 11.05-9.19 9.2a6 6 0 0 1-8.49-8.49l9.9-9.9a4 4 0 0 1 5.66 5.66l-9.9 9.9a2 2 0 0 1-2.83-2.83l9.2-9.19',
    'mic':'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8',
    'grid':'M4 4h3v3H4zM10 4h3v3h-3zM16 4h3v3h-3zM4 10h3v3H4zM10 10h3v3h-3zM16 10h3v3h-3zM4 16h3v3H4zM10 16h3v3h-3zM16 16h3v3h-3z',
    'bars':'M4 20v-3m5 3v-6m5 6v-10m5 10V5','play':'m8 5 11 7-11 7V5Z',
    'download':'M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3','share':'M12 16V3m-4 4 4-4 4 4M5 13v7h14v-7',
    'clock':'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2','refresh':'M20 11a8 8 0 1 0-3 7M20 4v7h-7',
    'mail':'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-2 2 10 7 10-7',
    'globe':'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2c-5 6-5 14 0 20M12 2c5 6 5 14 0 20',
    'settings':'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .32 1.78l.05.05-1.9 1.9-.05-.05a1.6 1.6 0 0 0-1.78-.32l-1 .42V21h-3v-2.22l-1-.42a1.6 1.6 0 0 0-1.78.32l-.05.05-1.9-1.9.05-.05a1.6 1.6 0 0 0 .32-1.78l-.42-1H5v-3h2.22l.42-1a1.6 1.6 0 0 0-.32-1.78l-.05-.05 1.9-1.9.05.05a1.6 1.6 0 0 0 1.78.32l1-.42V3h3v2.22l1 .42a1.6 1.6 0 0 0 1.78-.32l.05-.05 1.9 1.9-.05.05A1.6 1.6 0 0 0 19.4 10l.42 1H22v3h-2.18Z',
    'message-square':'M21 11.5v6.5a2 2 0 0 1-2 2H6l-4 3V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v3',
    'check':'m4 12 5 5L20 6','double-check':'m2 12 5 5L17 7m-5 10 5 0 5-5',
    'map-pin':'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 10h.01',
    'user':'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
    'more':'M5 12h.01M12 12h.01M19 12h.01'
  };
  function icon(name, cls = '') {return `<svg class="cc14-icon ${cls}" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icoPaths[name]||icoPaths.more}"/></svg>`;}
  function rel(s){if(!s)return '—';let ms=Date.now()-new Date(s).getTime();if(!Number.isFinite(ms))return '—';if(ms<60000)return 'Just now';if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;return new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});}
  function time(s){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});}
  function dur(sec){if(sec==null||!Number.isFinite(Number(sec)))return '—';const n=Math.max(0,Number(sec));return n<60?`${n}s`:`${Math.floor(n/60)}m ${n%60}s`;}
  const cstate = {issue:'Issue',working:'Working',resolved:'Resolved',open:'Open'};
  function button(text,cls='',props=''){return `<button type="button" class="cc14-btn ${cls}" ${props}>${text}</button>`;}
  function escAttr(x){return E(x);}
  function listNav(p){return `#/chats?${G.qs(p)}`;}
  function modal(content,{type='chat', close}={}){
    const overlay=document.createElement('div');overlay.className=`cc14-overlay cc14-overlay--${type}`;overlay.innerHTML=content;
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown',e=>{if(e.target===overlay)close?close():overlay.remove()});
    overlay.querySelector('[data-cc14-close]')?.addEventListener('click',()=>close?close():overlay.remove());
    return overlay;
  }
  function ensureHeader(){
    const target=$('.iconic-action-cluster');if(!target||target.querySelector('[data-cc14-toolbar]'))return;
    const toolbar=document.createElement('div');toolbar.className='cc14-header-tools';toolbar.dataset.cc14Toolbar='';
    const entries=[
      ['Configuration','Notifications, alerts, loyalty & bot settings','#/settings/configuration/notifications','settings'],
      ['WhatsApp','Send messages from your own WhatsApp number','#/settings/whatsapp','chat'],
      ['Loyalty Program','Miles redemption, day rates, tiers & seat upgrades','#/settings/loyalty-program/miles','check'],
      ['Switch User','View the app as another user','#/settings/switch-user','user'],
      ['Change Password','Update your account password','#/settings/change-password','settings'],
      ['My devices',"See and log out where you're signed in",'#/settings/my-devices','phone'],
      ['About','App version & check for updates','#/settings/about','more']
    ];
    toolbar.innerHTML=`<div class="cc14-languages">${button(`${icon('globe')} English ${icon('chevron')}`,'outline','data-cc14-lang aria-label="Language"')}<div data-cc14-lang-menu hidden class="cc14-language-list"><button type="button">English ✓</button></div></div><div class="cc14-settings-wrap">
       ${button(`${icon('settings')} Settings ${icon('chevron')}`,'outline','data-cc14-settings aria-label="Settings menu"')}
       <div class="cc14-settings-menu" data-cc14-settings-menu hidden><div class="cc14-settings-user"><b>${E(G.user?.phone||'Operator account')}</b><span>Operator Account</span></div>
         ${entries.map(([name,desc,href,ic])=>href?`<a href="${href}"><span class="cc14-settings-ico">${icon(ic)}</span><span><b>${E(name)}</b><small>${E(desc)}</small></span></a>`:`<button type="button" data-cc14-unwired="${E(name)}" title="Not yet available in this GDS"><span class="cc14-settings-ico">${icon(ic)}</span><span><b>${E(name)}</b><small>${E(desc)}</small></span></button>`).join('')}
       </div></div>`;
    target.appendChild(toolbar);
    toolbar.querySelector('[data-cc14-lang]').onclick=()=>{const x=$('[data-cc14-lang-menu]',toolbar);x.hidden=!x.hidden;};
    toolbar.querySelector('[data-cc14-lang-menu] button').onclick=()=>{toolbar.querySelector('[data-cc14-lang-menu]').hidden=true;};
    toolbar.querySelector('[data-cc14-settings]').onclick=()=>{const menu=$('[data-cc14-settings-menu]',toolbar);menu.hidden=!menu.hidden;};
    toolbar.querySelectorAll('[data-cc14-unwired]').forEach(b=>b.onclick=()=>G.toast(`${b.dataset.cc14Unwired} is not connected in this GDS.`));
    document.addEventListener('click',e=>{if(!toolbar.contains(e.target)){const menu=$('[data-cc14-settings-menu]',toolbar);if(menu)menu.hidden=true;const lm=$('[data-cc14-lang-menu]',toolbar);if(lm)lm.hidden=true;}});
  }
  const state={chatStatuses:new Map(), hideResolved:false, chatModal:null, reportPanel:false, callSearch:'', callsFilter:'all'};
  const demoChats=[
    {conversation_id:'preview_1',name:'Sample passenger',phone:'9XXXXXXXXX',service:'NTHB2',seat:'18U',ticket:'094734',last_message:'Pick up point ?',last_ts:new Date().toISOString(),unread:1,channel:'whatsapp',pickup:'Ammerpet (Free Metro Pickup)',drop:'Silk Board'},
    {conversation_id:'preview_2',name:'Passenger B',phone:'9XXXXXXXXX',service:'NTHB3',seat:'4U',ticket:'093668',last_message:'Now',last_ts:new Date(Date.now()-35*60000).toISOString(),unread:2,channel:'whatsapp',pickup:'MG Bus Station Metro',drop:'Sarjapur Iblur Lake'},
    {conversation_id:'preview_3',name:'Passenger C',phone:'9XXXXXXXXX',service:'NTHB1',seat:'13',ticket:'094724',last_message:'Thank you for contacting us. Please let us know how we can help you.',last_ts:new Date(Date.now()-39*60000).toISOString(),unread:1,pickup:'KPHB',drop:'Bommasandra'},
    {conversation_id:'preview_4',name:'Passenger D',phone:'9XXXXXXXXX',service:'NTHB3',seat:'11U',ticket:'094719',last_message:'Support / Help Required',last_ts:new Date(Date.now()-44*60000).toISOString(),unread:3,pickup:'Shamshabad Toll Gate',drop:'Electronic City'},
    {conversation_id:'preview_5',name:'Passenger E',phone:'9XXXXXXXXX',service:'NTHB3',seat:'1L',ticket:'094039',last_message:'You: Sure — how can I help? Tell me what you need and I’ll sort it out.',last_ts:new Date(Date.now()-60*60000).toISOString(),unread:2,pickup:'Gachibowli',drop:'Silk Board'},
    {conversation_id:'preview_6',name:'Passenger F',phone:'9XXXXXXXXX',service:'NTHB2',seat:'4U',ticket:'094007',last_message:'Please update boarding point and share pick up time',last_ts:new Date(Date.now()-67*60000).toISOString(),unread:7,pickup:'KPHB',drop:'Electronic City'}
  ];
  const isPreview=()=>G.query().preview==='1';
  const chatStatus=c=>state.chatStatuses.get(c.conversation_id) || (Number(c.unread)>0?'issue':'resolved');
  const ss=(v)=>`<span class="cc14-status cc14-status--${v}"><i></i>${E(cstate[v]||'Issue')} ${icon('chevron')}</span>`;
  function chatRow(c,preview){const status=chatStatus(c);return `<article class="cc14-conversation" data-cc14-cid="${escAttr(c.conversation_id)}">
    <span class="cc14-seat-avatar">${E(c.seat||'·')}</span><div class="cc14-convo-main"><div class="cc14-convo-name">${E(c.service||'Service')} · ${E(c.name||'Passenger')} · ${E(c.ticket||'—')} · Seat ${E(c.seat||'—')}</div><div class="cc14-route-detail">${E(c.pickup||c.from||'Pickup not available')} → ${E(c.drop||c.to||'Drop not available')}</div><div class="cc14-convo-preview">${E(c.last_message||'No messages yet')}</div>
     <div class="cc14-status-wrap"><button type="button" data-cc14-status-btn="${escAttr(c.conversation_id)}" aria-label="Conversation status">${ss(status)}</button><div class="cc14-status-options" data-cc14-status-menu="${escAttr(c.conversation_id)}" hidden>${Object.keys(cstate).map(v=>`<button type="button" data-cc14-set-status="${escAttr(c.conversation_id)}" data-value="${v}">${ss(v)}</button>`).join('')}</div></div></div>
    <time>${E(rel(c.last_ts))}</time>${Number(c.unread)>0?`<span class="cc14-unread">${Number(c.unread)}</span>`:''}</article>`;}
  async function renderChats(el,p={}){
    ensureHeader();const q=G.query();const f=q.filter||'all';const preview=isPreview();let d={conversations:[],unread_total:0};
    if(!preview)d=await G.get('/chats?'+G.qs({q:q.q||''}));else d={conversations:demoChats,unread_total:16};
    const all=d.conversations||[];
    const resolved=all.filter(c=>chatStatus(c)==='resolved').length;
    const show=all.filter(c=>!((f==='unread'&&!Number(c.unread))||(f==='issue'&&chatStatus(c)!=='issue')||(f==='working'&&chatStatus(c)!=='working')||(f==='resolved'&&chatStatus(c)!=='resolved')||(state.hideResolved&&chatStatus(c)==='resolved')));
    el.innerHTML=`<section class="cc14-page cc14-chats" aria-label="Chats"><div class="cc14-chats-toolbar">
     ${button(`${icon('plus')} New conversation`,'outline-blue','data-cc14-new')}${button(`${icon('eye-off')} ${state.hideResolved?'Show':'Hide'} resolved <span>${resolved}</span>`,'quiet','data-cc14-hide')}${button(`${icon('flag')} Reports`,'amber','data-cc14-reports')}
      <div class="cc14-toolbar-end"><label class="cc14-search-min">${icon('search')}<input type="search" aria-label="Search conversations" data-cc14-search placeholder="Search name, phone, PNR..." value="${E(q.q||'')}"></label><select data-cc14-filter aria-label="Filter conversations">${[['all','All conversations'],['unread','Unread'],['issue','Issues'],['working','Working'],['resolved','Resolved']].map(([v,t])=>`<option value="${v}" ${f===v?'selected':''}>${t}</option>`).join('')}</select></div></div>
      ${preview?'<div class="cc14-preview-banner">Reference preview — all example conversations and message statuses are illustrative; no messages are sent.</div>':''}
      ${state.reportPanel?`<div class="cc14-reports"><strong>Conversation reports</strong><div>${[['All',all.length],['Unread',Number(d.unread_total)||0],['Issues',all.filter(c=>chatStatus(c)==='issue').length],['Working',all.filter(c=>chatStatus(c)==='working').length],['Resolved',resolved]].map(([k,v])=>`<div><b>${E(v)}</b><span>${E(k)}</span></div>`).join('')}</div><small>Counts calculated from visible conversation records; follow-up status is UI-only until a workflow endpoint is connected.</small></div>`:''}
      <div class="cc14-conversation-list">${show.map(c=>chatRow(c,preview)).join('')||'<div class="cc14-empty">No conversations match your filters.</div>'}</div></section>`;
    $('[data-cc14-search]',el).addEventListener('keydown',e=>{if(e.key==='Enter')location.hash=listNav({q:e.target.value,filter:f,preview:preview?'1':null})});
    $('[data-cc14-search]',el).addEventListener('change',e=>location.hash=listNav({q:e.target.value,filter:f,preview:preview?'1':null}));
    $('[data-cc14-filter]',el).onchange=e=>location.hash=listNav({q:q.q,filter:e.target.value,preview:preview?'1':null});
    $('[data-cc14-hide]',el).onclick=()=>{state.hideResolved=!state.hideResolved;renderChats(el,p).catch(G.err)};
    $('[data-cc14-reports]',el).onclick=()=>{state.reportPanel=!state.reportPanel;renderChats(el,p).catch(G.err)};
    $('[data-cc14-new]',el).onclick=()=>newConversation(all,preview,el);
    el.onclick=e=>{
      const choice=e.target.closest('[data-cc14-set-status]');if(choice){e.stopPropagation();const cid=choice.dataset.cc14SetStatus;state.chatStatuses.set(cid,choice.dataset.value);G.toast('Follow-up status changed in the UI only; not saved to the server.');renderChats(el,p).catch(G.err);return;}
      const b=e.target.closest('[data-cc14-status-btn]');if(b){e.stopPropagation();const box=$(`[data-cc14-status-menu="${CSS.escape(b.dataset.cc14StatusBtn)}"]`,el);if(box)box.hidden=!box.hidden;return;}
      const row=e.target.closest('[data-cc14-cid]');if(row){const c=all.find(v=>v.conversation_id===row.dataset.cc14Cid);if(c)openChat(c,{preview,onClose:()=>{if(p.id)location.hash=listNav({q:q.q,filter:f,preview:preview?'1':null})}}).catch(G.err);}
    };
    if(p.id){const c=all.find(x=>x.conversation_id===decodeURIComponent(p.id));if(c)await openChat(c,{preview,onClose:()=>location.hash=listNav({q:q.q,filter:f,preview:preview?'1':null})});}
  }
  function newConversation(all,preview,el){
    const node=modal(`<div class="cc14-small-modal"><div class="cc14-small-header"><h2>New conversation</h2><button type="button" data-cc14-close>${icon('x')}</button></div><p>Start from an existing passenger conversation. Creating a new WhatsApp/SMS thread requires a messaging-provider integration.</p><input data-cc14-new-search placeholder="Search by name, ticket or seat" /><div class="cc14-new-rows">${all.map(c=>`<button type="button" data-cc14-open="${E(c.conversation_id)}">${icon('chat')} <b>${E(c.name||'Passenger')}</b><small>${E(c.ticket||c.service||'')}</small></button>`).join('')||'<p>No existing conversations to open.</p>'}</div></div>`,{type:'small'});
    const inp=$('[data-cc14-new-search]',node);inp.oninput=()=>$$('[data-cc14-open]',node).forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(inp.value.toLowerCase()));
    $$('[data-cc14-open]',node).forEach(b=>b.onclick=()=>{const c=all.find(x=>x.conversation_id===b.dataset.cc14Open);node.remove();if(c)openChat(c,{preview}).catch(G.err)});
  }
  function chatMessage(m){
    const out=m.direction==='out',channel=String(m.channel||'whatsapp').toLowerCase();
    const confirmed=['delivered','read'].includes(String(m.delivery_status||m.status||'').toLowerCase());
    const deliveryMark=out?`<span class="cc14-checks ${confirmed?'confirmed':'unverified'}" title="${confirmed?'Provider confirmed delivery state':'Saved internally; external delivery not confirmed'}">${icon(confirmed?'double-check':'check')}</span>`:'';
    return `<div class="cc14-bubble-row ${out?'cc14-bubble-row--out':''}"><div class="cc14-bubble ${out?'cc14-bubble--out':''}">${E(m.text||'')}<div class="cc14-msg-foot">${E(m.by||(!out&&channel==='whatsapp'?'passenger@whatsapp':''))} <time>${E(time(m.ts))}</time>${deliveryMark}</div></div></div>`;
  }
  async function openChat(c,{preview=false,onClose}={}){
    if(state.chatModal)state.chatModal.remove();
    let data;
    if(preview)data={booking:null,messages:[{direction:'out',channel:'whatsapp',text:'Get bus updates on your tracking link. Please reach your boarding point 10–15 minutes before departure.',by:'system',delivery_status:'read',ts:new Date(Date.now()-12*60000).toISOString()},{direction:'in',channel:'whatsapp',text:c.last_message,by:'passenger@whatsapp',ts:c.last_ts}],templates:[]};
    else data=await G.get(`/chats/${encodeURIComponent(c.conversation_id)}`);
    let activeChannel='all',quickGroup='pickup';
    const close=()=>{const n=state.chatModal;if(n)n.remove();state.chatModal=null;onClose?.();};
    const content=`<section class="cc14-chat-window" aria-label="Passenger conversation"><header class="cc14-chat-head">
      <span class="cc14-whatsapp-mark">${icon('chat')}</span><div class="cc14-chat-person"><strong>${E(c.name||data.booking?.contact?.name||'Passenger')}</strong><span class="cc14-chat-contact">${E(c.ticket||'')} · ${E(c.seat||'')}</span><small>${icon('map-pin')} ${E(c.pickup||'Pickup point unavailable')}</small></div>
      <span class="cc14-chat-connect">${icon('chat')} ${icon('bars')}</span><div class="cc14-chat-tools">
       ${button(icon('flag'),'icon-only','data-cc14-flag title="Report issue" aria-label="Report issue"')}
       ${button(icon('block'),'icon-only','data-cc14-block title="Block / unblock conversation" aria-label="Block / unblock conversation"')}
       ${button(icon('x'),'icon-only','data-cc14-close title="Close conversation" aria-label="Close conversation"')}
      </div></header>
      <div class="cc14-channels">${[['all','All'],['whatsapp','WhatsApp'],['sms','SMS'],['email','Email'],['calls','Calls']].map(([id,v])=>button(`${id==='whatsapp'?'☏ ':''}${v}`,`channel ${id==='all'?'selected':''}`,`data-cc14-channel="${id}"`)).join('')}<div class="cc14-reply-channel">Reply via: <b>WhatsApp</b></div></div>
      <div class="cc14-msg-history" data-cc14-messages></div>
      <div class="cc14-quick"><div class="cc14-quick-title"><button class="selected" data-cc14-quick="pickup">Pickup</button><span>|</span><button data-cc14-quick="drop">Drop</button><span>Quick chats</span></div><div class="cc14-quick-grid" data-cc14-quick-grid></div></div>
      <div class="cc14-compose"><button type="button" data-cc14-attach title="Attach file (provider unavailable)" aria-label="Attach file">${icon('clip')}</button><textarea data-cc14-message rows="1" placeholder="Type message..."></textarea>${button(icon('chat'),'cc14-whats-btn','data-cc14-composer-channel title="WhatsApp"')}${button(icon('mic'),'cc14-mic-btn','data-cc14-mic title="Voice recording requires a provider"')}${button(icon('send'),'cc14-send-btn','data-cc14-send title="Save outgoing message"')}</div>
      <div class="cc14-chat-disclosure">${preview?'Reference preview — no messages will be sent.':'Messages saved in this GDS are not delivered to WhatsApp/SMS without a provider integration.'}</div>
    </section>`;
    const node=modal(content,{type:'chat',close});state.chatModal=node;
    const history=$('[data-cc14-messages]',node);
    function renderHistory(){const m=(data.messages||[]).filter(v=>activeChannel==='all'||(activeChannel==='calls'?String(v.channel).toLowerCase()==='calls':String(v.channel).toLowerCase()===activeChannel));history.innerHTML=m.map(chatMessage).join('')||'<div class="cc14-msg-empty">No messages for this channel.</div>';history.scrollTop=history.scrollHeight;}
    renderHistory();
    $$('[data-cc14-channel]',node).forEach(b=>b.onclick=()=>{activeChannel=b.dataset.cc14Channel;$$('[data-cc14-channel]',node).forEach(t=>t.classList.toggle('selected',t===b));renderHistory();});
    const quicks={pickup:['Are you coming?','Bus reached Pickup','Traffic, Delayed by 15 mins','Bus is On-Time'],drop:['Are you at the drop point?','Bus reached Drop','Bus will reach in 15 mins','Thank you for travelling']};
    function quickRender(){$('[data-cc14-quick-grid]',node).innerHTML=quicks[quickGroup].map(t=>button(E(t),'quick-answer',`data-cc14-reply="${E(t)}"`)).join('');$$('[data-cc14-reply]',node).forEach(b=>b.onclick=()=>{const i=$('[data-cc14-message]',node);i.value=b.dataset.cc14Reply;i.focus();});}
    quickRender();$$('[data-cc14-quick]',node).forEach(b=>b.onclick=()=>{quickGroup=b.dataset.cc14Quick;$$('[data-cc14-quick]',node).forEach(t=>t.classList.toggle('selected',t===b));quickRender();});
    const send=async()=>{const input=$('[data-cc14-message]',node),txt=input.value.trim();if(!txt)return;if(!authorized('chats.send'))return G.toast('You do not have permission to send messages','bad');if(preview){data.messages.push({text:txt,direction:'out',channel:'whatsapp',ts:new Date().toISOString(),by:'preview'});}else{const res=await G.post(`/chats/${encodeURIComponent(c.conversation_id)}`,{text:txt,channel:'whatsapp'});data.messages.push(res);G.toast('Message saved in GDS; external delivery not connected.');}input.value='';activeChannel='all';$$('[data-cc14-channel]',node).forEach(b=>b.classList.toggle('selected',b.dataset.cc14Channel==='all'));renderHistory();};
    $('[data-cc14-send]',node).onclick=()=>send().catch(G.err);
    $('[data-cc14-message]',node).onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send().catch(G.err);}};
    $('[data-cc14-attach]',node).onclick=()=>G.toast('Attachment upload is not available in the current messaging API.');
    $('[data-cc14-mic]',node).onclick=()=>G.toast('Voice recording is not connected.');
    $('[data-cc14-composer-channel]',node).onclick=()=>G.toast('WhatsApp selected; external delivery is not connected.');
    $('[data-cc14-flag]',node).onclick=()=>G.toast('Use the conversation status dropdown for follow-up; provider reporting is not connected.');
    $('[data-cc14-block]',node).onclick=async()=>{
      if(preview)return G.toast('Blocking is not available in reference preview.');
      if(!authorized('chats.send'))return G.toast('Not authorized to block conversations','bad');
      const yes=await G.confirm(`Change blocked status for ${E(c.name||'this passenger')}?`,{ok:'Confirm change',danger:true});if(!yes)return;
      try{const r=await G.post(`/chats/${encodeURIComponent(c.conversation_id)}/block`,{reason:'operator_request'});G.toast(r.blocked?'Passenger blocked':'Passenger unblocked','ok');close();if(location.hash.startsWith('#/chats'))G.route();}catch(e){G.err(e)}
    };
  }
  const demoCalls=[
    {id:'p1',passenger_name:'Sample passenger',phone:'9XXXXXXXXX',pnr:'094708',seat:'2U',route:'Begumpet Metro Station → Silk Board',direction:'incoming',status:'answered',ts:new Date().toISOString(),duration_s:102,kind:'cloud',legs:[{type:'PSTN',name:'Passenger',status:'Answered',duration_s:37},{type:'APP',name:'Operator',status:'Answered',duration_s:38}]},
    {id:'p2',passenger_name:'Sample passenger',phone:'9XXXXXXXXX',pnr:'094708',seat:'2U',route:'Begumpet Metro Station → Silk Board',direction:'incoming',status:'busy',ts:new Date(Date.now()-6*60000).toISOString(),duration_s:0,kind:'cloud',legs:[{type:'APP',name:'Operator',status:'Busy',duration_s:34},{type:'PSTN',name:'Driver',status:'Skipped',duration_s:3}]},
    {id:'p3',passenger_name:'Passenger B',phone:'9XXXXXXXXX',pnr:'094528',seat:'10',route:'Paradise Metro Station → Electronic City',direction:'incoming',status:'missed',ts:new Date(Date.now()-12*60000).toISOString(),duration_s:0,kind:'cloud',legs:[{type:'APP',name:'Operator',status:'Skipped',duration_s:25}]},
    {id:'p4',passenger_name:'Passenger C',phone:'9XXXXXXXXX',pnr:'094721',seat:'11L',route:'Erragadda → Electronic City',direction:'outgoing',status:'missed',ts:new Date(Date.now()-19*60000).toISOString(),duration_s:0,kind:'cloud',legs:[{type:'PSTN',name:'Passenger',status:'No answer',duration_s:45}]},
    {id:'p5',passenger_name:'Passenger D',phone:'9XXXXXXXXX',pnr:'094544',seat:'10U',route:'Gachibowli → Devanahalli',direction:'incoming',status:'answered',ts:new Date(Date.now()-25*60000).toISOString(),duration_s:93,kind:'cloud',legs:[{type:'PSTN',name:'Passenger',status:'Answered',duration_s:59}]}
  ];
  function callBadge(t){let x=String(t||'').toLowerCase();return `<span class="cc14-leg cc14-leg--${x==='pstn'?'pstn':x==='app'?'app':'manual'}">${E(t||'MANUAL')}</span>`;}
  const statusText=s=>({answered:'Answered',missed:'No answer',busy:'Busy',not_reachable:'Not reachable',logged:'Logged',skipped:'Skipped'}[String(s||'').toLowerCase()]||String(s||'Logged'));
  function callLegs(c){const legs=Array.isArray(c.legs)?c.legs:[];
    if(!legs.length)return `<div class="cc14-legs-none"><span class="cc14-leg cc14-leg--manual">MANUAL</span> No provider routing legs</div>`;
    return legs.map(l=>`<div class="cc14-leg-row"><span class="cc14-leg-success ${/answer/i.test(l.status)?'ok':'fail'}">${/answer/i.test(l.status)?'✓':'—'}</span><span class="cc14-leg-person">${E(l.name||'Contact')}</span>${callBadge(l.type||'APP')}<span class="cc14-leg-sec">${E(dur(l.duration_s))}</span><span class="cc14-leg-outcome ${/answer/i.test(l.status)?'ok':/busy|no answer/i.test(l.status)?'bad':'muted'}">${E(l.status||'Unknown')}</span></div>`).join('');}
  function callRow(c,preview){const inc=c.direction==='incoming',miss=String(c.status).toLowerCase()==='missed',selected=c.legs?.find(l=>l.status==='Answered');const isProvider=!!(c.provider||c.recording_url||c.recordingUrl),rec=String(c.recording_url||c.recordingUrl||'');let rawNumber=String(c.phone||'');const header=[c.service,c.passenger_name||'Unknown',c.pnr,c.seat].filter(Boolean).join(' · ');
    return `<article class="cc14-call-row"><div class="cc14-call-direction ${inc?'incoming':'outgoing'} ${miss?'missed':''}">${icon(inc?'phone-in':'phone-out')}</div><div class="cc14-call-name"><strong>${E(header||'Unknown')}</strong><small>${E(c.route||'Journey information not available')}</small></div><div class="cc14-call-when"><span>${E(time(c.ts))}</span>${Number(c.duration_s)>0?`<b>${icon('clock')}${E(dur(c.duration_s))}</b>`:''}</div><div class="cc14-call-route">${callBadge(c.legs?.[0]?.type|| (isProvider?'PSTN':'MANUAL'))}<span>${E(c.passenger_name||rawNumber||'Passenger')}</span><span class="cc14-flow-arrow">→</span>${c.legs?.[0]?callBadge(c.legs[0].type):''}<span>${E(c.legs?.[0]?.name||'—')}</span></div><div class="cc14-call-legs">${callLegs(c)}</div><div class="cc14-call-controls"><span class="cc14-call-result ${miss?'red':'green'}">${E(statusText(c.status))}</span>
      ${button(icon('play'),'call-control play',`data-cc14-record="${E(c.id)}" ${!rec?'disabled title="No call recording is available"':''} aria-label="Play call recording"`)}<span class="cc14-duration">${E(dur(c.duration_s))}</span>${button(icon('download'),'call-control download',`data-cc14-download="${E(c.id)}" ${!rec?'disabled title="No recording to download"':''} aria-label="Download call recording"`)}${button(icon('share'),'call-control share',`data-cc14-share="${E(c.id)}" ${!rec?'disabled title="No recording to share"':''} aria-label="Share call recording"`)}${button(icon('more'),'call-control more',`data-cc14-details="${E(c.id)}" aria-label="Call details"`)}</div></article>`;
  }
  async function renderCalls(el){ensureHeader();const f=G.query(),preview=isPreview(),q=(f.q||state.callSearch||'').trim();const active=f.filter||'all';let data=preview?{calls:demoCalls,stats:{total:demoCalls.length}}:await G.get('/calls?'+G.qs({q}));const all=data.calls||[];
    const matches=all.filter(c=>active==='all'||(active==='incoming'&&c.direction==='incoming')||(active==='outgoing'&&c.direction==='outgoing')||(active==='missed'&&c.status==='missed'));
    const counts={all:all.length,incoming:all.filter(c=>c.direction==='incoming').length,outgoing:all.filter(c=>c.direction==='outgoing').length,missed:all.filter(c=>c.status==='missed').length};
    el.innerHTML=`<section class="cc14-page cc14-calls" aria-label="Calls"><div class="cc14-call-header"><label class="cc14-call-search">${icon('search')}<input type="search" data-cc14-call-search placeholder="Search calls" value="${E(q)}" aria-label="Search calls"></label>${button(icon('grid'),'dialpad','data-cc14-dial aria-label="Open dial pad"')}<span class="cc14-signal" title="Calling provider not connected">${icon('bars')}</span></div>
      ${preview?'<div class="cc14-preview-banner">Reference preview — all calls, legs and statuses below are illustrative. There are no playable recordings.</div>':''}
      <div class="cc14-recent"><div class="cc14-recent-title">Recent calls <div class="cc14-call-filters">${[['missed','Missed'],['outgoing','Outgoing'],['incoming','Incoming']].map(([x,t])=>`<button type="button" data-cc14-call-filter="${x}" class="cc14-filter-pill ${x} ${active===x?'on':''}">${t} <span>${counts[x]}</span></button>`).join('')}${active!=='all'?button('All','reset','data-cc14-call-filter="all"'):''}</div></div>
      <div class="cc14-call-list">${matches.map(c=>callRow(c,preview)).join('')||'<div class="cc14-empty">No calls for the selected search or filter.</div>'}</div></div><div class="cc14-call-note">Calls are shown from operator records. PSTN/APP routing, playback and downloadable recordings require a connected telephony provider; no cloud call is initiated by this page.</div></section>`;
    const search=$('[data-cc14-call-search]',el);search.onchange=()=>location.hash=`#/calls?${G.qs({q:search.value,filter:active,preview:preview?'1':null})}`;search.onkeydown=e=>{if(e.key==='Enter')search.dispatchEvent(new Event('change'))};
    $$('[data-cc14-call-filter]',el).forEach(b=>b.onclick=()=>location.hash=`#/calls?${G.qs({q:search.value,filter:b.dataset.cc14CallFilter,preview:preview?'1':null})}`);
    $('[data-cc14-dial]',el).onclick=()=>dialpad();
    const find=id=>all.find(x=>String(x.id)===String(id));
    $$('[data-cc14-details]',el).forEach(b=>b.onclick=()=>callDetails(find(b.dataset.cc14Details),preview,el));
    $$('[data-cc14-record]',el).forEach(b=>b.onclick=()=>recording(find(b.dataset.cc14Record),'play'));
    $$('[data-cc14-download]',el).forEach(b=>b.onclick=()=>recording(find(b.dataset.cc14Download),'download'));
    $$('[data-cc14-share]',el).forEach(b=>b.onclick=()=>recording(find(b.dataset.cc14Share),'share'));
  }
  function recording(c,action){if(!c)return;const u=c.recording_url||c.recordingUrl;if(!u)return G.toast('No recording was returned by the telephony provider.');try{const url=new URL(String(u),location.origin);if(url.protocol!=='https:'&&url.protocol!=='http:')throw Error('Unsupported recording URL');if(action==='play'){const m=modal(`<div class="cc14-small-modal"><div class="cc14-small-header"><h2>Call recording</h2><button data-cc14-close>${icon('x')}</button></div><audio controls src="${E(url.href)}" style="width:100%"></audio></div>`,{type:'small'});return m;}if(action==='download'){const a=document.createElement('a');a.href=url.href;a.download='call-recording';a.rel='noopener';a.click();return;}if(action==='share'){if(navigator.clipboard?.writeText){navigator.clipboard.writeText(url.href).then(()=>G.toast('Recording link copied')).catch(G.err);}else G.toast('Clipboard is not available.');}}catch(e){G.err(e)}}
  function callDetails(c,preview,el){if(!c)return;const m=modal(`<div class="cc14-small-modal"><div class="cc14-small-header"><h2>Call details</h2><button data-cc14-close>${icon('x')}</button></div><div class="cc14-call-detail-grid"><span>Passenger</span><b>${E(c.passenger_name||'Unknown')}</b><span>Time</span><b>${E(c.ts?fdt(c.ts):'—')}</b><span>Direction</span><b>${E(c.direction)}</b><span>Outcome</span><b>${E(statusText(c.status))}</b><span>Duration</span><b>${E(dur(c.duration_s))}</b><span>PNR</span><b>${E(c.pnr||'—')}</b></div><label class="cc14-detail-note">Notes<textarea data-cc14-notes>${E(c.notes||'')}</textarea></label><div class="cc14-detail-actions">${authorized('calls.make')&&!preview?button('Save notes','blue','data-cc14-save-notes'):''}${authorized('calls.make')&&!preview?button('Log follow-up call','outline','data-cc14-callback'):''}</div></div>`,{type:'small'});
    $('[data-cc14-save-notes]',m)?.addEventListener('click',async()=>{try{await G.put(`/calls/${encodeURIComponent(c.id)}`,{notes:$('[data-cc14-notes]',m).value});G.toast('Notes saved','ok');m.remove();renderCalls(el).catch(G.err)}catch(e){G.err(e)}});
    $('[data-cc14-callback]',m)?.addEventListener('click',()=>{m.remove();G.callNow({phone:c.phone,name:c.passenger_name,pnr:c.pnr}).catch(G.err)});
  }
  function dialpad(){const m=modal(`<div class="cc14-small-modal cc14-dial-modal"><div class="cc14-small-header"><h2>Dial</h2><button data-cc14-close>${icon('x')}</button></div><div class="cc14-dial-warning">Manual call logging only — no PSTN/VoIP provider connected.</div><input type="tel" data-cc14-dial-input inputmode="tel" placeholder="Enter a 10-digit phone number" maxlength="14" aria-label="Phone number"/><div class="cc14-numpad">${'123456789*0#'.split('').map(x=>button(x,'number',`data-cc14-num="${x}"`)).join('')}</div>${button(`${icon('phone')} Log phone call`,'green wide','data-cc14-log')}</div>`,{type:'small'});
    const input=$('[data-cc14-dial-input]',m);$$('[data-cc14-num]',m).forEach(b=>b.onclick=()=>{input.value+=b.dataset.cc14Num;input.focus()});
    $('[data-cc14-log]',m).onclick=()=>{const v=input.value.replace(/\D/g,'');if(!/^\d{10}$/.test(v))return G.toast('Enter a valid 10-digit phone number','bad');m.remove();if(!authorized('calls.make'))return G.toast('Not authorized to log calls','bad');G.callNow({phone:v,name:'',kind:'manual'}).catch(G.err);};
  }
  G.screens.chats=renderChats;
  G.screens.calls=renderCalls;
})();
