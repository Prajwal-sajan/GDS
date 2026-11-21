(function(){
  'use strict';

  const LANGUAGES = ['English','हिन्दी','తెలుగు','தமிழ்','ಕನ್ನಡ','मराठी','বাংলা','ગુજરાતી','മലയാളം','ਪੰਜਾਬੀ','ଓଡ଼ିଆ','অসমীয়া','اردو'];
  const SETTINGS_MENU = [
    { key:'team-access', label:'Team & access', desc:'Staff, agents, branches and who can do what', icon:'users', color:'violet' },
    { key:'branding', label:'Branding', desc:'Logo, colors, fonts & signin page', icon:'brush', color:'pink' },
    { key:'configuration', label:'Configuration', desc:'Notifications, alerts, loyalty & bot settings', icon:'sliders', color:'gray' },
    { key:'whatsapp', label:'WhatsApp', desc:'Send messages from your own WhatsApp number', icon:'chat', color:'green' },
    { key:'loyalty-program', label:'Loyalty Program', desc:'Miles redemption, day rates, tiers & seat upgrades', icon:'spark', color:'orange' },
    { key:'switch-user', label:'Switch User', desc:'View the app as another user', icon:'switchUser', color:'violet' },
    { key:'change-password', label:'Change Password', desc:'Update your account password', icon:'lock', color:'red' },
    { key:'my-devices', label:'My devices', desc:"See and log out where you're signed in", icon:'phoneDevice', color:'red' },
    { key:'about', label:'About', desc:'App version & check for updates', icon:'info', color:'gray' },
  ];
  const TEAM_TABS = [
    { key:'office-staff', label:'Office staff', count:10, icon:'users' },
    { key:'bus-staff', label:'Bus staff', count:51, icon:'bus' },
    { key:'agents', label:'Agents', count:4, icon:'agent' },
    { key:'branches', label:'Branches', icon:'building' },
    { key:'access', label:'Access', icon:'key' },
  ];

  const OFFICE_STAFF = [
    { id:'devraj', initials:'D', name:'Devraj', phone:'+91 91132 09427', role:'Admin', active:true, last:'7h ago · 231' },
    { id:'harish', initials:'HM', name:'Harish mahi trans', phone:'+91 85519 94449', role:'Admin', active:true, last:'4h ago · 3', modal:true, email:'—', language:'English', added:'18 Nov 2026, 02:09 pm' },
    { id:'karthik', initials:'K', name:'Karthik', phone:'+91 97418 90668', role:'Admin', active:true, last:'25 Oct · 19' },
    { id:'radha', initials:'R', name:'Radha', phone:'+91 97319 90033', role:'Admin', active:true, last:'1d ago · 192' },
  ];
  const BUS_STAFF = [
    { initials:'A', name:'Akram', phone:'+91 12345 67890', role:'Driver', active:true, last:'—' },
    { initials:'AR', name:'Ayyamola Ramesh', phone:'+91 80084 41640', role:'Driver', active:true, last:'23 Oct · 12' },
    { initials:'C', name:'Chandrashekhar', phone:'+91 83106 19874', role:'Driver', active:false, last:'3 Sept · 101', muted:true },
    { initials:'DC', name:'Dasharath (Pickup Van)', phone:'+91 96660 47774', role:'Driver', active:true, last:'—' },
  ];
  const AGENTS = [
    { initials:'AE', name:'ANU Enterprises,Bommasandra', phone:'+91 99450 88571', type:'Agent', mode:'Online', active:false, last:'—' },
    { initials:'DA', name:'Devaraj Agent', phone:'+91 88614 58224', type:'Agent', mode:'Online', active:true, last:'21 Sept · 5' },
    { initials:'ST', name:'Sigma Tour And Travels', phone:'+91 99164 90900', type:'Agent', mode:'Online', active:true, last:'12 Sept · 2' },
    { initials:'TA', name:'Travel Agent Demo', phone:'+91 97413 50307', type:'Agent', mode:'Online', active:true, last:'17 Aug · 21' },
  ];

  const ACCESS_TABS = ['Roles','Test access','Groups','Advanced'];
  const ROLE_TABS = ['Viewer','Bus crew (Driver, Conductor, Helper)','Agent','Service Associate','Booking Executive','Pickup Manager','Service Agent','Accountant','Branch Admin','Manager'];
  const ACCESS_SECTIONS = [
    { title:'Trips & pickups', side:'left', items:[
      { label:'View trip sheets & pickup charts', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Mark boarded / no-show, passenger notes', kind:'toggle', value:false },
      { label:'See bus location', kind:'toggle', value:false },
      { label:'Call passengers and crew', kind:'toggle', value:false },
    ]},
    { title:'Bookings', side:'right', items:[
      { label:'Book seats', kind:'toggle', value:false },
      { label:'View bookings', kind:'scope', value:'Company', scopes:['Off','Own','Branch','Company'] },
      { label:'Edit passengers & points', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Cancel tickets', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Shift seat / date', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Send passenger messages (delay, pre-boarding, resend ticket)', kind:'toggle', value:false },
      { label:'Add comments to a PNR', kind:'toggle', value:false },
      { label:'Book on behalf of agents', kind:'toggle', value:false },
      { label:'Block seats', kind:'toggle', value:false },
      { label:'Unblock seats / book a blocked seat', kind:'toggle', value:false },
      { label:'See passenger phone numbers', kind:'toggle', value:false },
    ]},
    { title:'Schedules (services)', side:'left', items:[
      { label:'View services & seat layouts', kind:'toggle', value:true },
      { label:'See who is booked on a service', kind:'toggle', value:true },
      { label:"View a service's revenue", kind:'toggle', value:false },
      { label:'Edit services (timings, coach, bus & driver, delay)', kind:'toggle', value:false },
      { label:'Edit fares', kind:'toggle', value:false },
      { label:'Switch services on / off', kind:'toggle', value:false },
      { label:'Create services / import trip sheets', kind:'toggle', value:false },
      { label:'Delete services', kind:'toggle', value:false },
    ]},
    { title:'Routes', side:'right', items:[
      { label:'View routes', kind:'toggle', value:true },
      { label:'Create routes', kind:'toggle', value:false },
      { label:'Edit routes, fares, stops & route map', kind:'toggle', value:false },
      { label:'Delete / retime routes', kind:'toggle', value:false },
    ]},
    { title:'Fleet', side:'left', items:[
      { label:'View vehicles & fleet map', kind:'toggle', value:true },
      { label:'Add vehicles', kind:'toggle', value:false },
      { label:'Edit vehicles & documents', kind:'toggle', value:false },
      { label:'Delete vehicles', kind:'toggle', value:false },
      { label:'Share a bus location link', kind:'toggle', value:true },
      { label:'View coaches / seat layouts', kind:'toggle', value:true },
      { label:'Create & edit coaches', kind:'toggle', value:false },
      { label:'Delete coaches', kind:'toggle', value:false },
    ]},
    { title:'Chats', side:'right', items:[
      { label:'View trip chats', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Reply / send photos', kind:'toggle', value:false },
      { label:'Change chat status / mark read', kind:'toggle', value:false },
      { label:'Delete chats, block or report passengers', kind:'toggle', value:false },
      { label:'Share / revoke chat links', kind:'toggle', value:false },
    ]},
    { title:'Calls', side:'left', items:[
      { label:'Make calls', kind:'toggle', value:false },
      { label:'View call history', note:'Own = calls they were on', kind:'scope', value:'Off', scopes:['Off','Own','Company'] },
      { label:'Listen to recordings', kind:'toggle', value:false },
      { label:'Manage speed dials', kind:'toggle', value:false },
    ]},
    { title:'Accounts', side:'right', items:[
      { label:'Sales', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Transactions & receivables', kind:'scope', value:'Off', scopes:['Off','Own','Branch','Company'] },
      { label:'Add / delete ledger entries', kind:'toggle', value:false },
      { label:'Reports', kind:'toggle', value:false },
      { label:'Invoices & statements (view / pay)', kind:'toggle', value:false },
      { label:'Settlements (view)', kind:'toggle', value:false },
      { label:'Upload & match settlements', kind:'toggle', value:false },
      { label:'Agent settings (terms, credit, commission)', kind:'toggle', value:false },
      { label:'Send payment links / collect', kind:'toggle', value:false },
    ]},
    { title:'Daily ops', side:'left', items:[
      { label:'Daily report', kind:'scope', value:'Off', scopes:['Off','Branch','Company'] },
      { label:'View ratings', kind:'toggle', value:true },
      { label:'Follow up on ratings (status, comments)', kind:'toggle', value:true },
      { label:'Import ratings', kind:'toggle', value:false },
    ]},
    { title:'Staff & HR', side:'right', items:[
      { label:'View staff', kind:'toggle', value:false },
      { label:'Add / edit staff', kind:'toggle', value:false },
      { label:'Attendance (view, correct, approve)', kind:'toggle', value:false },
      { label:'Advances & reimbursements', kind:'toggle', value:false },
      { label:'Payouts (generate, approve, mark paid)', kind:'toggle', value:false },
    ]},
    { title:'Offers & loyalty', side:'left', items:[
      { label:'Coupons', kind:'toggle', value:false },
      { label:'Branch offers at the counter', kind:'toggle', value:false },
      { label:'Loyalty program settings', kind:'toggle', value:false },
      { label:'Seat-upgrade settings', kind:'toggle', value:false },
    ]},
    { title:'Users & access', side:'right', items:[
      { label:'View users', kind:'scope', value:'Off', scopes:['Off','Branch','Company'] },
      { label:'Add users (roles below their own)', kind:'toggle', value:false },
      { label:'Edit users (name, branch, status, routes)', kind:'toggle', value:false },
      { label:"Change a user's role", kind:'toggle', value:false },
      { label:'Remove users', kind:'toggle', value:false },
      { label:'Change what roles can do', kind:'toggle', value:false },
    ]},
    { title:'Settings', side:'left', items:[
      { label:'Configuration & notifications', kind:'toggle', value:false },
      { label:'Branding', kind:'toggle', value:false },
      { label:'Branches', kind:'toggle', value:false },
      { label:'WhatsApp setup', kind:'toggle', value:false },
      { label:'Use Sarathi (AI assistant)', kind:'toggle', value:false },
    ]},
  ];

  const BRAND_DEFAULTS = {
    appName:'November Travels',
    tagline:'Travel with Comfort',
    helpline:'080-71033737,9113209540',
    supportEmail:'info@mail.novembertravels.com',
    brandColor:'#2563EB',
    fontFamily:'Poppins',
    scheme:'Light',
    pwaName:'November Travels App',
    pwaShortName:'NovTravels'
  };
  const BRAND_PALETTE = ['#2563EB','#5A84E6','#7899E7','#9BB4EA','#B8C8EC'];
  const BRANDING_UPLOADS = [
    { label:'Mobile logo', state:'hasLogo', note:'Best size 352 × 96 px (shows up to 176 × 48)' },
    { label:'Desktop logo', state:'empty', empty:'No desktop logo', note:'Best size 576 × 112 px (shows up to 288 × 56). Empty → mobile logo is used' },
    { label:'Logo (dark)', state:'empty', empty:'No logo (dark)' },
    { label:'Favicon', state:'empty', empty:'No favicon' },
    { label:'Signin background', state:'empty', empty:'No signin background' },
  ];

  const PLACEHOLDERS = {
    configuration:{ title:'Configuration', blurb:'Notifications, alerts, loyalty rules and bot settings appear in grouped cards exactly under Settings → Configuration.', cards:[
      ['Notifications & alerts','Configure event subscriptions, delivery channels, quiet hours, escalation rules and preview message templates.'],
      ['Loyalty & upgrades','Manage miles conversion, blackout dates, tier multipliers, redemption day rates and seat-upgrade windows.'],
      ['Bot settings','Control Sarathi response tone, suggested prompts and handoff behavior.'],
      ['Call preferences','Set cloud-calling defaults, masking, recording, speed dials and bus-staff routing rules.'],
    ]},
    whatsapp:{ title:'WhatsApp', blurb:'Connect your number, verify templates and control passenger messaging workflows from a single settings surface.', cards:[
      ['Number setup','Pair your verified business number and show connection health, last sync and template status.'],
      ['Templates','Maintain delay, pre-boarding, boarding reminder and ticket resend templates.'],
      ['Sharing & links','Control chat link creation, agent visibility and chat ownership.'],
      ['Delivery monitoring','Inspect outgoing message counts, failures and retry health.'],
    ]},
    'loyalty-program':{ title:'Loyalty Program', blurb:'The loyalty screen surfaces miles, day-rate controls, tiers and seat upgrades using the same design language shown in the settings menu.', cards:[
      ['Miles rules','Set redemption ratio, minimum redeemable miles, booking thresholds and maximum discount caps.'],
      ['Tier multipliers','Configure Bronze, Silver, Gold and Platinum earn-rate multipliers.'],
      ['Day rates','Tune weekday and weekend redemption rates with instant previews.'],
      ['Seat upgrades','Set time windows, consent defaults and free-upgrade policies.'],
    ]},
    'switch-user':{ title:'Switch User', blurb:'Owner and admin users can quickly switch context to validate permissions and operator experiences.', cards:[
      ['Available users','Search active users and switch into their view with a single tap.'],
      ['Session notice','Clearly show when you are viewing the app as another user and provide a safe return path.'],
    ]},
    'change-password':{ title:'Change Password', blurb:'Secure account management with strong password rules and recent credential activity.', cards:[
      ['Password update','Current password, new password, confirm password and password strength indicator.'],
      ['Security hints','Show password rules, sign-out behavior and optional step-up verification.'],
    ]},
    'my-devices':{ title:'My devices', blurb:'List every signed-in device with location summary, browser, OS and last active time.', cards:[
      ['Active sessions','Current device highlighted with other signed-in devices below.'],
      ['Sign-out controls','Terminate single sessions or sign out everywhere with confirmation.'],
    ]},
    about:{ title:'About', blurb:'Version information, release notes, update checks and build metadata stay grouped under About.', cards:[
      ['App version','Surface current version, build date and environment details.'],
      ['Check for updates','Display availability, changelog summary and force refresh option for staff.'],
    ]},
  };

  function icon(name){
    const p = {
      chevronDown:'<path d="M6 9l6 6 6-6"/>',
      check:'<path d="M5 13l4 4L19 7"/>',
      globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>',
      settings:'<path d="M12 8.4A3.6 3.6 0 1112 15.6 3.6 3.6 0 0112 8.4z"/><path d="M4.6 12a7.7 7.7 0 01.1-1.2l-2-1.6 2-3.5 2.4.8a8.5 8.5 0 012-1.2l.4-2.5h4l.4 2.5a8.5 8.5 0 012 1.2l2.4-.8 2 3.5-2 1.6c.1.4.1.8.1 1.2s0 .8-.1 1.2l2 1.6-2 3.5-2.4-.8a8.5 8.5 0 01-2 1.2l-.4 2.5h-4l-.4-2.5a8.5 8.5 0 01-2-1.2l-2.4.8-2-3.5 2-1.6c-.1-.4-.1-.8-.1-1.2z"/>',
      trips:'<path d="M7 6h10M7 12h10M7 18h7"/><rect x="4" y="3" width="16" height="18" rx="3"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
      chats:'<path d="M8 17l-4 3V7a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3H8z"/><path d="M9 10h6M9 14h4"/>',
      calls:'<path d="M15.8 15.4c-2.2 2.2-6.4-2-8.6-4.2S.8 4.8 3 2.6c.8-.8 2-.8 2.8 0L8.3 5A2 2 0 018.8 7l-1.3 2a11.3 11.3 0 007.2 7.2l2-1.3a2 2 0 012 .5l2.4 2.4c.8.8.8 2 0 2.8-1.2 1.2-3.7 1.5-5.3-.2z"/>',
      users:'<path d="M16 19a4 4 0 00-8 0"/><circle cx="12" cy="8" r="4"/><path d="M20 19a4 4 0 00-3-3.87M4 19a4 4 0 013-3.87"/>',
      bus:'<rect x="4" y="6" width="16" height="10" rx="2"/><path d="M4 12h16M8 16v2M16 16v2M7.5 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>',
      agent:'<path d="M17 7l-5-4-5 4v10l5 4 5-4z"/><path d="M12 8v8M8.5 10h7"/>',
      building:'<path d="M4 20h16M6 20V8l6-4 6 4v12M9 10h1M9 13h1M9 16h1M14 10h1M14 13h1M14 16h1"/>',
      key:'<path d="M15 7a4 4 0 11-3.9 5H4l-2 2 2 2 2-2h2l2-2h1.1A4 4 0 0115 7z"/>',
      eye:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
      edit:'<path d="M4 20l4.5-1 9.1-9.1a2 2 0 00-2.8-2.8L5.7 16.2 4 20z"/><path d="M13.5 5.5l3 3"/>',
      trash:'<path d="M4 7h16M9 7V4h6v3M7 7v12a2 2 0 002 2h6a2 2 0 002-2V7M10 11v6M14 11v6"/>',
      phone:'<path d="M15.8 15.4c-2.2 2.2-6.4-2-8.6-4.2S.8 4.8 3 2.6c.8-.8 2-.8 2.8 0L8.3 5A2 2 0 018.8 7l-1.3 2a11.3 11.3 0 007.2 7.2l2-1.3a2 2 0 012 .5l2.4 2.4c.8.8.8 2 0 2.8-1.2 1.2-3.7 1.5-5.3-.2z"/>',
      shield:'<path d="M12 3l7 3v5c0 5-3.6 8.3-7 10-3.4-1.7-7-5-7-10V6l7-3z"/>',
      activity:'<path d="M3 12h4l2-4 3 8 3-6h6"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      more:'<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
      close:'<path d="M6 6l12 12M18 6L6 18"/>',
      mail:'<path d="M4 6h16v12H4z"/><path d="M4 8l8 6 8-6"/>',
      pulse:'<path d="M3 12h5l2-4 3 8 2-5h6"/>',
      calendar:'<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"/>',
      preview:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
      reset:'<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M6.5 9A7 7 0 0118 6M17.5 15A7 7 0 016 18"/>',
      save:'<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4M9 20v-6h6v6"/>',
      badge:'<path d="M9 12l2 2 4-4"/><path d="M12 2l2 2.3 3-.5.5 3L20 9l-2 2 2 2-1.5 2.2.5 3-3-.5L12 22l-2.5-2.3-3 .5.5-3L4 13l2-2-2-2 1.5-2.2-.5-3 3 .5L12 2z"/>',
      droplet:'<path d="M12 3s5 5.5 5 9a5 5 0 01-10 0c0-3.5 5-9 5-9z"/>',
      desktop:'<path d="M4 5h16v10H4z"/><path d="M9 19h6M12 15v4"/>',
      image:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 13l2.5-3 3.5 4 2-2 2 3"/><circle cx="9" cy="9" r="1.2"/>',
      upload:'<path d="M12 16V6"/><path d="M8 10l4-4 4 4"/><path d="M5 19h14"/>',
      mobile:'<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M11 18h2"/>',
      hash:'<path d="M9 3L7 21M17 3l-2 18M4 9h16M3 15h16"/>',
      brush:'<path d="M13 4l7 7-5 5-7-7z"/><path d="M6 18c-2 0-3 1-3 3 2 0 4-1 4-3 0-1-1-2-1-2s-1 1-1 2z"/>',
      sliders:'<path d="M4 6h6M14 6h6M10 6v6M4 18h10M18 18h2M14 18v-6M4 12h2M10 12h10M6 12V6"/>',
      chat:'<path d="M8 17l-4 3V7a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3H8z"/>',
      spark:'<path d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2z"/><path d="M5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14zm14 1l.5 1.7 1.7.5-1.7.5-.5 1.8-.5-1.8-1.7-.5 1.7-.5.5-1.7z"/>',
      switchUser:'<path d="M16 17l4-4-4-4"/><path d="M20 13H9"/><path d="M8 7A4 4 0 118 15M4 19a4 4 0 014-4"/>',
      lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
      phoneDevice:'<rect x="8" y="3" width="8" height="18" rx="2"/><circle cx="12" cy="17" r="1"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v5"/><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none"/>',
    };
    const inner = p[name] || p.info;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  function logoMarkup(size='normal'){
    return `<div class="stp-brand-logo-mark ${size==='small' ? 'small' : ''}"><span>Nt</span> NOVEMBER TRAVELS</div>`;
  }

  function currentSettingsRoute(){
    const raw = location.hash.split('?')[0].replace(/^#\//,'').split('/');
    if (raw[0] !== 'settings') return { section:'', sub:'' };
    return { section: raw[1] || 'team-access', sub: raw[2] || 'office-staff' };
  }

  function headerLink(section){
    if (section === 'team-access') return '#/settings/team-access/office-staff';
    return `#/settings/${section}`;
  }

  function renderHeaderMenus(){
    const current = currentSettingsRoute();
    return {
      language: `<div class="stp-pop stp-lang-pop" data-lang-pop hidden>${LANGUAGES.map((lang) => `<button class="stp-lang-item ${lang === 'English' ? 'active' : ''}" data-language-option="${esc(lang)}" type="button"><span>${esc(lang)}</span><span class="tick">${icon('check')}</span></button>`).join('')}</div>`,
      settings: `<div class="stp-pop stp-settings-pop" data-settings-pop hidden>
          <div class="stp-settings-pop-head"><b>918551994449</b><span>Operator Account</span></div>
          <div class="stp-settings-pop-body">
            <div class="stp-settings-label">BUSINESS SETTINGS</div>
            ${SETTINGS_MENU.map((item) => {
              const active = item.key === current.section;
              return `<a href="${headerLink(item.key)}" class="stp-settings-link ${active ? 'active' : ''}" data-settings-link="${item.key}"><span class="stp-settings-link-icon ${item.color}">${icon(item.icon)}</span><span><b>${item.label}</b><small>${item.desc}</small></span></a>`;
            }).join('')}
          </div>
        </div>`
    };
  }

  function syncHeaderParity(){
    const route = location.hash.split('?')[0];
    document.querySelectorAll('.iconic-tab-pill').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const active = href === '#/gds' ? route.startsWith('#/gds') : route.startsWith(href);
      a.classList.toggle('iconic-tab-pill--active', active);
      a.dataset.active = active ? 'true' : 'false';
    });
    const current = currentSettingsRoute();
    document.querySelectorAll('[data-settings-link]').forEach((link) => link.classList.toggle('active', link.dataset.settingsLink === current.section));
  }
  G.renderHeaderMenus = renderHeaderMenus;
  G.syncHeaderParity = syncHeaderParity;

  function pageTitle(title, actionLabel, actionHash, iconName='bus'){
    return `<div class="stp-page-title"><div class="stp-page-title-main"><div class="stp-hero-icon">${icon(iconName)}</div><h1>${title}</h1></div>${actionLabel ? `<div class="stp-title-actions"><a class="stp-btn primary" href="${actionHash || '#'}">${icon('users')} ${actionLabel}</a></div>` : ''}</div>`;
  }

  function topTeamTabs(active, placeholder='Search by name or phone...'){
    return `<div class="stp-top-tabs-wrap"><div class="stp-top-tabs">${TEAM_TABS.map((tab) => `<a class="stp-seg-tab ${active === tab.key ? 'active' : ''}" href="#/settings/team-access/${tab.key}"><span class="stp-seg-icon">${icon(tab.icon)}</span><span>${tab.label}</span>${tab.count ? `<span class="stp-tab-count">${tab.count}</span>` : ''}</a>`).join('')}</div><label class="stp-search"><span>${icon('search')}</span><input data-settings-search placeholder="${placeholder}" type="text"/></label></div>`;
  }

  function tableActions(){
    return `<div class="stp-actions"><button class="stp-icon-btn" data-action="view" type="button">${icon('eye')}</button><button class="stp-icon-btn" data-action="edit" type="button">${icon('edit')}</button><button class="stp-icon-btn delete" data-action="delete" type="button">${icon('trash')}</button></div>`;
  }

  function officeRow(r){
    return `<div class="stp-table-row ${r.muted ? 'muted' : ''}" data-person="${esc(r.id || r.name)}"><div class="stp-user"><div class="stp-avatar">${esc(r.initials)}</div><div><div class="stp-name ${r.muted ? 'muted' : ''}">${esc(r.name)}</div></div></div><div class="stp-cell-icon"><span class="ico">${icon('phone')}</span><span>${esc(r.phone)}</span></div><div><span class="stp-role-chip violet"><span class="dot"></span>${esc(r.role)} ${icon('chevronDown')}</span></div><div><button class="stp-switch ${r.active ? 'on' : ''}" data-toggle type="button"></button></div><div class="stp-cell-icon"><span class="ico">${icon('clock')}</span><span>${esc(r.last)}</span></div>${tableActions()}</div>`;
  }

  function busRow(r){
    return `<div class="stp-table-row ${r.muted ? 'muted' : ''}"><div class="stp-user"><div class="stp-avatar orange">${esc(r.initials)}</div><div><div class="stp-name ${r.muted ? 'muted' : ''}">${esc(r.name)}</div></div></div><div class="stp-cell-icon"><span class="ico">${icon('phone')}</span><span>${esc(r.phone)}</span></div><div><span class="stp-role-chip orange"><span class="dot"></span>${esc(r.role)} ${icon('chevronDown')}</span></div><div><button class="stp-switch ${r.active ? 'on' : ''}" data-toggle type="button"></button></div><div class="stp-cell-icon"><span class="ico">${icon('clock')}</span><span>${esc(r.last)}</span></div>${tableActions()}</div>`;
  }

  function agentRow(r){
    return `<div class="stp-table-row"><div class="stp-user"><div class="stp-avatar teal">${esc(r.initials)}</div><div><div class="stp-name">${esc(r.name)}</div><a class="stp-sub" href="#">${icon('settings')} Agent settings</a></div></div><div class="stp-cell-icon"><span class="ico">${icon('phone')}</span><span>${esc(r.phone)}</span></div><div><span class="stp-role-chip"><span class="dot"></span>${esc(r.type)}</span></div><div><span class="stp-mode-chip">${esc(r.mode)}</span></div><div><button class="stp-switch ${r.active ? 'on' : ''}" data-toggle type="button"></button></div><div class="stp-cell-icon"><span class="ico">${icon('clock')}</span><span>${esc(r.last)}</span></div>${tableActions()}</div>`;
  }

  function tableHeader(columns){
    return `<div class="stp-table-head">${columns.map((c) => `<div class="stp-th-ico"><span class="stp-mini-ico">${icon(c.icon)}</span><span>${c.label}</span></div>`).join('')}</div>`;
  }

  function renderTeamAccess(sub){
    const actionLabels = { 'office-staff':'Add office staff', 'bus-staff':'Add bus staff', agents:'Add agent', branches:'Add User', access:'Add User' };
    let body = '';
    if (sub === 'office-staff') {
      body = `<div class="stp-inline-note"><div><b>Branches</b> — none yet; everyone is org-wide. Create one to group users and account bookings by office.</div><button class="stp-btn slim" type="button">＋ New branch</button></div>
      <div class="stp-card stp-table-card">
        ${tableHeader([{label:'Name',icon:'users'},{label:'Phone',icon:'phone'},{label:'Role',icon:'shield'},{label:'Active',icon:'activity'},{label:'Last login',icon:'clock'},{label:'Actions',icon:'more'}])}
        ${OFFICE_STAFF.map(officeRow).join('')}
      </div>`;
    } else if (sub === 'bus-staff') {
      body = `<div class="stp-inline-note"><div><b>Branches</b> — none yet; everyone is org-wide. Create one to group users and account bookings by office.</div><button class="stp-btn slim" type="button">＋ New branch</button></div>
      <div class="stp-card stp-table-card">
        ${tableHeader([{label:'Name',icon:'users'},{label:'Phone',icon:'phone'},{label:'Role',icon:'shield'},{label:'Active',icon:'activity'},{label:'Last login',icon:'clock'},{label:'Actions',icon:'more'}])}
        ${BUS_STAFF.map(busRow).join('')}
      </div>`;
    } else if (sub === 'agents') {
      body = `<div class="stp-card stp-table-card">
        <div class="stp-table-head" style="grid-template-columns:minmax(360px,2.15fr) minmax(220px,1.1fr) minmax(180px,.8fr) 130px 110px 160px">${[
          {label:'Name',icon:'users'},{label:'Phone',icon:'phone'},{label:'Type',icon:'shield'},{label:'Mode',icon:'globe'},{label:'Active',icon:'activity'},{label:'Last login',icon:'clock'},{label:'Actions',icon:'more'}
        ].map((c) => `<div class="stp-th-ico"><span class="stp-mini-ico">${icon(c.icon)}</span><span>${c.label}</span></div>`).join('')}</div>
        ${AGENTS.map(agentRow).join('')}
      </div>`;
    } else if (sub === 'branches') {
      body = `<div class="stp-inline-note" style="padding:22px 8px 10px"><div class="stp-note-text" style="margin:0">An office or team. Users pinned to a branch can sell any trip; their bookings are accounted under the branch, and branch admins see only their branch's bookings and people.</div><button class="stp-btn primary slim" type="button">＋ New branch</button></div>
      <div class="stp-empty-panel"><div class="stp-big-ico">${icon('building')}</div><h3>No branches yet</h3><p>Everyone in this organization currently has org-wide access. Create a branch to start pinning users to an office.</p></div>`;
    } else {
      body = renderAccessScreen();
    }
    return `${pageTitle('Team & access', actionLabels[sub], '#', 'bus')}${topTeamTabs(sub)}${body}`;
  }

  function renderAccessScreen(){
    const left = ACCESS_SECTIONS.filter((x) => x.side === 'left');
    const right = ACCESS_SECTIONS.filter((x) => x.side === 'right');
    return `
      <div class="stp-access-tabs">${ACCESS_TABS.map((tab, idx) => `<a class="stp-chip-nav ${idx===0 ? 'active':''}" href="#">${tab}</a>`).join('')}</div>
      <div class="stp-note-text">What each role can do, and its limits (e.g. at most 3 blocked seats). Turn things on or off for a whole role, or create your own roles. For one person, use Edit user → Permissions & routes.</div>
      <div class="stp-note-text" style="margin-top:14px"><b style="display:block;color:#121c30;font-size:18px;margin-bottom:4px">Who can do what</b>Choose what each role may do at your company. A role you have not changed uses SaveTrip's standard permissions.</div>
      <div class="stp-role-strip">${ROLE_TABS.map((tab, idx) => `<a class="stp-role-pill ${idx===0 ? 'active':''}" href="#">${tab}</a>`).join('')}<a class="stp-role-pill new" href="#">＋ New role</a></div>
      <div class="stp-note-text" style="margin-top:0;margin-bottom:14px">Using SaveTrip's standard permissions for Viewer.</div>
      <div class="stp-access-grid">
        <div>${left.map(renderPermissionSection).join('')}</div>
        <div>${right.map(renderPermissionSection).join('')}</div>
      </div>
      <div class="stp-savebar"><button class="stp-btn primary" type="button">Save Viewer</button><div class="stp-footnote">Changes reach everyone with this role within a few seconds. To change one person only, use Permissions on their row.</div></div>`;
  }

  function renderPermissionSection(section){
    return `<div class="stp-perm-title">${section.title}</div><div class="stp-perm-card">${section.items.map((item) => `<div class="stp-perm-row"><div>${item.label}${item.note ? `<span class="stp-perm-note">${item.note}</span>` : ''}</div><div>${item.kind === 'scope' ? `<div class="stp-scope">${item.scopes.map((scope) => `<button class="${item.value === scope ? 'active' : ''}" type="button">${scope}</button>`).join('')}</div>` : `<button class="stp-switch ${item.value ? 'on' : ''}" data-toggle type="button"></button>`}</div></div>`).join('')}</div>`;
  }

  function renderBranding(){
    return `${pageTitle('Branding', '', '', 'brush').replace('</div><div class="stp-title-actions"></div>','</div>')}
      <div class="stp-page-title" style="padding-top:0;justify-content:flex-end"><div class="stp-brand-toolbar"><button class="stp-btn ghost" type="button">${icon('preview')} Preview</button><button class="stp-btn ghost" type="button" data-brand-reset>${icon('reset')} Reset</button><button class="stp-btn primary" type="button" data-brand-save>${icon('save')} Save</button></div></div>
      <div class="stp-brand-preview">
        <div class="stp-brand-hero">
          <div class="stp-brand-left"><div class="stp-brand-logo">${logoMarkup()}</div><div class="stp-brand-text"><h2 data-brand-name>${BRAND_DEFAULTS.appName}</h2><p data-brand-tagline>${BRAND_DEFAULTS.tagline}</p><div class="stp-brand-chip-row"><span class="stp-brand-chip">${icon('phone')} <span data-brand-phone>${BRAND_DEFAULTS.helpline}</span></span><span class="stp-brand-chip">${icon('mail')} <span data-brand-email>${BRAND_DEFAULTS.supportEmail}</span></span></div></div></div>
          <div class="stp-palette-preview">${BRAND_PALETTE.map((c,idx)=>`<span class="sw" style="background:${c}"></span>`).join('')}</div>
        </div>
      </div>
      <div class="stp-brand-card"><div class="stp-card-head"><div class="stp-hero-icon" style="width:54px;height:54px">${icon('badge')}</div><h3>Identity</h3></div><div class="stp-form-grid">${fieldWrap('App name','appName','badge',BRAND_DEFAULTS.appName)}${fieldWrap('Tagline','tagline','spark',BRAND_DEFAULTS.tagline)}${fieldWrap('Helpline','helpline','phone',BRAND_DEFAULTS.helpline)}${fieldWrap('Support email','supportEmail','mail',BRAND_DEFAULTS.supportEmail)}</div></div>
      <div class="stp-brand-card"><div class="stp-card-head"><div class="stp-hero-icon" style="width:54px;height:54px">${icon('settings')}</div><h3>Colors & Typography</h3></div><div class="stp-color-panel"><div><div class="stp-field-wrap"><label>Brand color</label><div class="stp-color-well"><div class="stp-color-box" data-brand-color-box></div><div class="stp-color-input"><span class="ico">${icon('droplet')}</span><input data-brand-color value="${BRAND_DEFAULTS.brandColor}"/></div></div><div class="stp-color-strip">${BRAND_PALETTE.map((c)=>`<button type="button" data-palette="${c}"><span class="sw long" style="background:${c}"></span></button>`).join('')}</div></div><div class="stp-field-wrap" style="margin-top:18px"><label>Color scheme</label><div class="stp-scheme-row">${['Light','Dark','System'].map((s,idx)=>`<button class="stp-scheme ${BRAND_DEFAULTS.scheme===s ? 'active' : ''}" data-scheme="${s}" type="button">${icon(idx===0 ? 'spark' : idx===1 ? 'globe':'desktop')} ${s}</button>`).join('')}</div></div></div><div>${fieldWrap('Font family','fontFamily','badge',BRAND_DEFAULTS.fontFamily,['Poppins','Inter','Manrope'])}</div></div></div>
      <div class="stp-brand-card"><div class="stp-card-head"><div class="stp-hero-icon" style="width:54px;height:54px">${icon('image')}</div><h3>Logo & Assets</h3></div><div class="stp-assets-grid">${BRANDING_UPLOADS.map(renderUploadCard).join('')}</div><div class="stp-note-line">Logos: PNG or SVG with a transparent background. Tap the logo in the app header any time to return home.</div></div>
      <div class="stp-brand-card"><div class="stp-card-head"><div class="stp-hero-icon" style="width:54px;height:54px">${icon('mobile')}</div><h3>PWA Advanced</h3></div><div class="stp-form-grid">${fieldWrap('PWA name','pwaName','mobile',BRAND_DEFAULTS.pwaName)}${fieldWrap('PWA short name','pwaShortName','hash',BRAND_DEFAULTS.pwaShortName)}</div></div>`;
  }

  function fieldWrap(label,name,ico,value,options){
    const control = options ? `<select data-brand-field="${name}">${options.map((o)=>`<option ${value===o?'selected':''}>${o}</option>`).join('')}</select>` : `<input data-brand-field="${name}" value="${esc(value)}"/>`;
    return `<div class="stp-field-wrap"><label>${label}</label><div class="stp-field"><span class="ico">${icon(ico)}</span>${control}</div></div>`;
  }

  function renderUploadCard(item){
    return `<div class="stp-upload-card"><label>${item.label}</label><div class="stp-upload-box">${item.state === 'hasLogo' ? `<div class="stp-upload-logo">${logoMarkup('small')}</div>` : `<div class="stp-upload-placeholder">${icon('image')}</div><b>${item.empty}</b>`}<button class="stp-upload-action" type="button">${icon('upload')} Upload</button></div>${item.note ? `<div class="stp-help-text">${item.note}</div>` : ''}</div>`;
  }

  function renderPlaceholder(section){
    const data = PLACEHOLDERS[section] || PLACEHOLDERS.configuration;
    return `${pageTitle(data.title,'','','settings').replace('</div><div class="stp-title-actions"></div>','</div>')}<div class="stp-note-text">${data.blurb}</div><div class="stp-placeholder-grid">${data.cards.map(([title,text])=>`<div class="stp-placeholder-card"><h3>${title}</h3><p>${text}</p><ul class="stp-bullet-list"><li>Follows the same gradients, spacing and icon treatments as the screenshots.</li><li>Ready for wiring to live settings APIs without changing the layout shell.</li></ul></div>`).join('')}</div>`;
  }

  function renderSettingsScreen(section, sub){
    if (section === 'branding') return renderBranding();
    if (section === 'team-access') return renderTeamAccess(sub || 'office-staff');
    return renderPlaceholder(section);
  }

  function mountUserModal(row){
    const data = OFFICE_STAFF.find((x) => x.id === row) || OFFICE_STAFF[1];
    const wrap = document.createElement('div');
    wrap.className = 'stp-modal-backdrop';
    wrap.innerHTML = `<div class="stp-modal"><div class="stp-modal-head"><div class="stp-modal-user"><div class="stp-avatar">${esc(data.initials)}</div><div class="stp-modal-title"><h3>${esc(data.name)}</h3><div class="stp-badge-small"><span class="dot"></span>${esc(data.role)}</div></div></div><button class="stp-modal-close" type="button">${icon('close')}</button></div><div class="stp-modal-body">${[
      ['phone','Phone',data.phone],['pulse','Status','<span class="good">Active</span>'],['mail','Email',data.email || '—'],['globe','Language',data.language || 'English'],['switchUser','Last login',data.last || '4h ago · 3 logins'],['calendar','Added',data.added || '18 Nov 2026, 02:09 pm']
    ].map(([ico,label,val]) => `<div class="stp-modal-section"><div class="ico">${icon(ico)}</div><div class="stp-modal-kv"><small>${label}</small><div class="${label==='Status' ? 'good':''}">${val}</div></div></div>`).join('')}</div><div class="stp-modal-foot"><button class="stp-btn primary" type="button">${icon('edit')} Edit</button><button class="stp-btn" type="button" data-close-modal>Close</button></div></div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close-modal]') || e.target.closest('.stp-modal-close')) close(); });
    document.body.appendChild(wrap);
  }

  function bindScreen(el, section, sub){
    const input = el.querySelector('[data-settings-search]');
    if (input) {
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        el.querySelectorAll('.stp-table-row').forEach((row) => {
          row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }
    el.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => btn.classList.toggle('on')));
    el.querySelectorAll('[data-action="view"]').forEach((btn) => btn.addEventListener('click', (e) => {
      const parent = e.currentTarget.closest('.stp-table-row');
      mountUserModal(parent?.dataset.person || 'harish');
    }));
    el.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.addEventListener('click', () => G.toast('Edit flow prepared for parity wiring.')));
    el.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener('click', () => G.toast('Delete confirmation prepared for parity wiring.')));

    const colorInput = el.querySelector('[data-brand-color]');
    const colorBox = el.querySelector('[data-brand-color-box]');
    if (colorInput && colorBox) {
      const syncColor = (v) => {
        colorBox.style.background = v;
        colorInput.value = v.toUpperCase();
      };
      colorInput.addEventListener('input', () => {
        const v = colorInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) syncColor(v);
      });
      el.querySelectorAll('[data-palette]').forEach((btn) => btn.addEventListener('click', () => syncColor(btn.dataset.palette)));
      el.querySelectorAll('[data-scheme]').forEach((btn) => btn.addEventListener('click', () => {
        el.querySelectorAll('[data-scheme]').forEach((b) => b.classList.remove('active')); btn.classList.add('active');
      }));
      el.querySelectorAll('[data-brand-field]').forEach((field) => field.addEventListener('input', syncBrandPreview));
      colorInput.addEventListener('input', syncBrandPreview);
      const resetBtn = el.querySelector('[data-brand-reset]');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        Object.entries(BRAND_DEFAULTS).forEach(([k,v]) => {
          const node = el.querySelector(`[data-brand-field="${k}"]`);
          if (node) node.value = v;
        });
        syncColor(BRAND_DEFAULTS.brandColor);
        el.querySelectorAll('[data-scheme]').forEach((b) => b.classList.toggle('active', b.dataset.scheme === BRAND_DEFAULTS.scheme));
        syncBrandPreview();
      });
      const saveBtn = el.querySelector('[data-brand-save]');
      if (saveBtn) saveBtn.addEventListener('click', () => G.toast('Branding settings saved.','ok'));
      syncBrandPreview();
      function syncBrandPreview(){
        const val = (key) => el.querySelector(`[data-brand-field="${key}"]`)?.value || BRAND_DEFAULTS[key];
        const setText = (sel, value) => { const node = el.querySelector(sel); if (node) node.textContent = value; };
        setText('[data-brand-name]', val('appName'));
        setText('[data-brand-tagline]', val('tagline'));
        setText('[data-brand-phone]', val('helpline'));
        setText('[data-brand-email]', val('supportEmail'));
      }
    }
  }

  const previousSettings = G.screens.settings;
  G.screens.settings = function settingsParityScreen(el, p){
    const section = p[0] || 'team-access';
    const sub = p[1] || 'office-staff';
    el.className = 'stp-root';
    el.innerHTML = `<div class="stp-shell">${renderSettingsScreen(section, sub)}</div>`;
    bindScreen(el, section, sub);
    G.syncHeaderParity && G.syncHeaderParity();
  };
  G.settingsParityMenu = SETTINGS_MENU;
  G.settingsParityLanguages = LANGUAGES;
  G.settingsParityFallback = previousSettings;
  G.settingsParityIcon = icon;
  G.settingsParityRefs = { TEAM_TABS, ACCESS_TABS, ROLE_TABS, ACCESS_SECTIONS, BRAND_DEFAULTS, BRAND_PALETTE, BRANDING_UPLOADS, SETTINGS_MENU, LANGUAGES };
})();
