/* Screenshot-based Sarathi v12 UI. Real GDS conversations via existing /api/sarathi endpoints. */
(() => {
  'use strict';
  if (!window.G || !G.screens) return;
  const E=s=>esc(s??'');
  const icons={
    spark:'<path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9ZM20 18l.7 1.3L22 20l-1.3.7L20 22l-.7-1.3L18 20l1.3-.7Z"/>',
    send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    bus:'<rect x="4" y="4" width="16" height="15" rx="3"/><path d="M4 11h16M8 19v2M16 19v2M8 15h.01M16 15h.01"/>',
    chart:'<path d="M4 20V9M9 20V4M14 20v-8M19 20V7"/><path d="M3 20h18"/>',
    users:'<circle cx="9" cy="8" r="4"/><path d="M1 21v-2a7 7 0 0 1 14 0v2M17 5a4 4 0 0 1 0 8M19 21v-2a6 6 0 0 0-3-5"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'
  };
  const svg=(k,n=23)=>`<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k]||icons.spark}</svg>`;
  const prompts=[
    {id:'fleet',title:"Today's fleet",detail:'Which services are running late today?',question:'Which services are running late today?',icon:'bus',tone:'blue'},
    {id:'revenue',title:'Earnings & bookings',detail:"What was yesterday’s revenue and how many seats were sold?",question:"What was yesterday's revenue and how many seats were sold?",icon:'chart',tone:'green'},
    {id:'passengers',title:'Passenger insights',detail:'How many passengers travelled this week?',question:'How many passengers travelled this week?',icon:'users',tone:'purple'},
    {id:'staff',title:'Staff & licences',detail:'Which driving licences are expiring soon?',question:'Which driving licences are expiring soon?',icon:'shield',tone:'orange'}
  ];
  const when=s=>s?fdt(s):'';
  const empty=()=>`<div class="sa-welcome"><h2>Hi, I'm <span>Sarathi</span></h2><p>Ask me anything about your fleet, earnings, passengers or staff. Pick a starting point below.</p><div class="sa-prompts">${prompts.map((q,i)=>`<button class="sa-prompt ${i===0?'featured':''}" data-sa-prompt="${E(q.id)}"><span class="sa-prompt-icon ${q.tone}">${svg(q.icon,24)}</span><span class="sa-prompt-copy"><b>${E(q.title)}</b><small>${E(q.detail)}</small></span>${i===0?`<span class="sa-arrow">${svg('chevron',19)}</span>`:''}</button>`).join('')}</div></div>`;
  const renderMessage=m=>`<div class="sa-message ${m.role==='user'?'user':'assistant'}"><span class="sa-message-who">${m.role==='user'?'You':'Sarathi'}</span><div class="sa-message-text">${E(m.text||'')}</div>${Array.isArray(m.table)&&m.table.length?`<div class="sa-data-table">${G.autoTable(m.table.slice(0,50))}</div>`:''}<span class="sa-message-time">${E(when(m.ts))}</span></div>`;
  G.screens.sarathi = async el => {
    let convs=[],messages=[],cid=null,busy=false,loadError='';
    try {const res=await Promise.all([G.get('/sarathi/conversations'),G.get('/sarathi/suggestions')]);convs=Array.isArray(res[0])?res[0]:[];}
    catch(e){loadError=e.message||'Conversation service unavailable';}
    const draw=()=>{
      const selected=convs.find(x=>String(x.id)===String(cid));
      el.innerHTML=`<div class="sa-root"><aside class="sa-sidebar"><button class="sa-new-chat" data-sa-action="new">${svg('spark',22)} New chat</button><p class="sa-recents-title">RECENT</p><div class="sa-recent-list">${convs.length?convs.map(c=>`<button class="sa-recent ${String(cid)===String(c.id)?'on':''}" data-sa-conv="${E(c.id)}"><span class="sa-recent-icon">${svg('spark',18)}</span><span><b>${E(c.title||'Conversation')}</b><small>${E(when(c.created_at))}</small></span></button>`).join(''):'<div class="sa-no-conversations">No conversations yet</div>'}</div></aside><section class="sa-chat"><header class="sa-header"><span class="sa-spark">${svg('spark',34)}</span><div><div class="sa-heading"><b>Sarathi</b><span>AI</span></div><small><i></i> Your fleet, revenue &amp; staff copilot</small></div></header><div class="sa-main" data-sa-main>${loadError?`<p class="sa-error">${E(loadError)}</p>`:''}${messages.length?`<div class="sa-thread">${messages.map(renderMessage).join('')}${busy?'<div class="sa-typing">Sarathi is checking GDS data…</div>':''}</div>`:empty()}</div><footer class="sa-footer"><form data-sa-form class="sa-form"><input data-sa-question aria-label="Ask Sarathi anything" placeholder="Ask Sarathi anything…" autocomplete="off"><button type="submit" aria-label="Send message" data-sa-send ${busy?'disabled':''}>${svg('send',23)}</button></form><small>Sarathi can make mistakes — verify important numbers.</small></footer></section></div>`;
      const box=el.querySelector('[data-sa-main]');if(box&&messages.length)box.scrollTop=box.scrollHeight;
    };
    const loadConv=id=>{const c=convs.find(x=>String(x.id)===String(id));if(!c)return;cid=c.id;messages=Array.isArray(c.messages)?c.messages.slice():[];draw();};
    const request=async question=>{
      question=String(question||'').trim();if(!question||busy)return;
      const now=new Date().toISOString(); messages.push({role:'user',text:question,ts:now});busy=true;draw();
      // Delay/late questions are not covered by the current rule-based Sarathi API. Do not misstate sales as live lateness.
      if(/\blate\b|\bdelay(?:ed|s)?\b|\brunning late\b/i.test(question)){
        messages.push({role:'assistant',text:'Live delay and on-road lateness are not available from the connected Sarathi endpoint yet. The GDS can answer historical service performance, revenue, occupancy, passenger totals and upcoming licence expiries.',ts:new Date().toISOString()});busy=false;draw();return;
      }
      try{
        const r=await G.post('/sarathi/ask',{question,conversation_id:cid});
        cid=r.conversation_id;
        messages.push({role:'assistant',...(r.answer||{text:'No response'}),ts:new Date().toISOString()});
        const existing=convs.find(c=>String(c.id)===String(cid));
        if(existing){existing.messages=messages.slice();}else{convs.unshift({id:cid,title:question.slice(0,65),created_at:now,messages:messages.slice()});}
      }catch(e){messages.push({role:'assistant',text:`Unable to fetch a GDS answer: ${e.message||'Service unavailable'}`,ts:new Date().toISOString()});}
      finally{busy=false;draw();}
    };
    G.on(el,'click','[data-sa-action]',b=>{if(b.dataset.saAction==='new'){cid=null;messages=[];draw();const field=el.querySelector('[data-sa-question]');field?.focus();}});
    G.on(el,'click','[data-sa-conv]',b=>loadConv(b.dataset.saConv));
    G.on(el,'click','[data-sa-prompt]',b=>{const prompt=prompts.find(q=>q.id===b.dataset.saPrompt);if(prompt)request(prompt.question).catch(G.err);});
    G.on(el,'submit','[data-sa-form]',(form,event)=>{event.preventDefault();const question=form.querySelector('[data-sa-question]')?.value;request(question).catch(G.err);});
    draw();
  };
  window.__SARATHI_V12_BUILD__='sarathi-v12-20261121';
})();
