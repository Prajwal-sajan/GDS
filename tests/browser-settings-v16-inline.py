"""Offline Playwright browser smoke test. Does not call a server. Uses mocked endpoints and inline assets."""
from pathlib import Path
import re, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'public'
OUT=Path(__file__).resolve().parents[1]/'reports'/'settings-v16'
OUT.mkdir(parents=True,exist_ok=True)
source=(ROOT/'index.html').read_text()
style='\n'.join((ROOT/x).read_text() for x in re.findall(r'href="(/css/[^\"]+)"',source)) if False else '\n'.join((ROOT/(x.lstrip('/'))).read_text() for x in re.findall(r'href="(/css/[^\"]+)"',source))
scripts=re.findall(r'<script src="(/js/[^\"]+)"',source)
users=[
 {'id':1,'name':'Devraj','phone':'9113209427','role':'admin','status':'ACTIVE','branch_id':None,'created_at':'2026-11-18T09:00:00Z','login_count':231},
 {'id':2,'name':'Harish mahi trans','phone':'8551994449','role':'admin','status':'ACTIVE','branch_id':None,'created_at':'2026-11-18T14:09:00Z','login_count':3},
 {'id':3,'name':'Karthik','phone':'9741890668','role':'admin','status':'ACTIVE','branch_id':None,'created_at':'2026-10-25T09:00:00Z','login_count':19},
 {'id':4,'name':'Radha','phone':'9731990033','role':'admin','status':'ACTIVE','branch_id':None,'created_at':'2026-10-25T09:00:00Z','login_count':192},
 {'id':5,'name':'Devaraj Agent','phone':'8861458224','role':'agent','status':'ACTIVE','branch_id':None,'created_at':'2026-10-25T09:00:00Z','login_count':5},
]
perms=['settings.view','settings.modify','iam.manage_users','iam.manage_roles','staff.view','chats.view','calls.view','trips.view','schedules.view','routes.view','fleet.view','accounts.view','sarathi.ask','dailyops.view']
roles={'admin':{'key':'admin','name':'Admin','permissions':perms,'builtin':True},'viewer':{'key':'viewer','name':'Viewer','permissions':['schedules.view','routes.view'],'builtin':False},'agent':{'key':'agent','name':'Agent','permissions':['accounts.own_only'],'builtin':True},'driver':{'key':'driver','name':'Bus crew','permissions':['trips.view'],'builtin':True}}
op={'operator_name':'November Travels','app_name':'November Travels','tagline':'Travel with Comfort','helpline_number':'080-71033737,9113209540','support_email':'info@mail.novembertravels.com','brand_hex':'#2563EB','font_family':'Poppins','logo_url':''}
brand={'color_scheme':'Light','pwa_name':'November Travels App','pwa_short_name':'NovTravels','assets':{}}
settings={'operator':op,'miles':{'is_active':True,'miles_to_rupee_ratio':.1,'max_discount_percent':30,'min_redeemable_miles':1000,'min_booking_amount':50},'day_rates':[{'day_of_week':i,'redemption_rate':75} for i in range(7)],'tier_multipliers':[{'tier_name':x,'multiplier':v} for x,v in [('Bronze',1),('Silver',1.1),('Gold',1.2),('Platinum',1.5)]],'blackout_dates':[],'seat_upgrade_policy':{'enabled':True,'auto_apply_when_free':False,'default_consent':'opt_in','max_offers_per_trip':6,'windows':[{'name':'T-15m','start':15,'notification_channels':['whatsapp']}]}}
D={'users':users,'perms':perms,'roles':roles,'operator':op,'branding':brand,'settings':settings,'groups':[],'subs':[],'branches':[],'wa':{'display_name':'','business_number':'','templates':[],'status':'not_connected'},'config':{'quiet_hours_enabled':False,'quiet_start':'22:00','quiet_end':'07:00','escalation_minutes':15,'bot_tone':'professional','bot_handoff':True}}
stub=r'''
window.__DATA__=DATA_HERE;
window.__mutations=[];
const store=new Map([['token','mock-login']]);
Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},configurable:true});
location.hash='#/settings/team-access/office-staff';
window.fetch=async (u,opt={})=>{
 const d=window.__DATA__,p=String(u).split('?')[0],method=opt.method||'GET',payload=opt.body?JSON.parse(opt.body):{};
 let v={};
 if(p==='/api/auth/me')v={user:{id:2,name:'Harish mahi trans',phone:'8551994449',role:'admin',real_user_id:2,permissions:d.perms},operator:d.operator,roles:Object.fromEntries(Object.entries(d.roles).map(([k,x])=>[k,x.name]))};
 else if(p==='/api/auth/switchable-users')v=d.users;
 else if(p==='/api/auth/switchable-users')v=d.users;
 else if(p==='/api/auth/sessions')v={sessions:[{id:1,user_agent:'Chrome on Windows',created_at:'2026-11-21T10:00:00Z',last_seen:'2026-11-21T10:00:00Z',current:true}],has_legacy_session:false};
 else if(p==='/api/alerts')v={alerts:[],server_time:'2026-11-21T10:00:00Z'};
 else if(p==='/api/chats')v={conversations:[],unread_total:0};
 else if(p==='/api/iam/users'){
   if(method==='POST'){v={...payload,id:d.users.length+1,status:'ACTIVE',login_count:0};d.users.push(v);}
   else v=d.users;
 }else if(/^\/api\/iam\/users\/\d+$/.test(p)){
  const id=Number(p.split('/').pop());let row=d.users.find(x=>x.id===id)||{};
  if(method==='PUT'){Object.assign(row,payload);}if(method==='DELETE'){d.users=d.users.filter(x=>x.id!==id);}v=row;
 }else if(p==='/api/iam/roles')v={catalog:{trips:['trips.view']},roles:Object.values(d.roles)};
 else if(p==='/api/iam/groups'){v=method==='POST'?(d.groups.push({...payload,id:d.groups.length+1}),d.groups.at(-1)):d.groups;}
 else if(p.startsWith('/api/iam/access-evaluate/')){const usr=d.users.find(x=>String(x.id)===p.split('/').pop());v={user:{...usr,permissions:d.roles[usr.role]?.permissions||[]},role_name:usr.role,groups:[],note:'Scope restrictions not enforced'};}
 else if(p.startsWith('/api/iam/roles/')){const key=p.split('/').pop();d.roles[key]={key,...payload};v=d.roles[key];}
 else if(p==='/api/branches'){v=method==='POST'?(d.branches.push({...payload,id:d.branches.length+1}),d.branches.at(-1)):d.branches;}
 else if(p.startsWith('/api/branches/'))v=payload;
 else if(p==='/api/cities')v={cities:[{id:107258,name:'Hyderabad'},{id:102257,name:'Bengaluru'}]};
 else if(p==='/api/staff')v={staff:[]};
 else if(p==='/api/settings/branding'){
   if(method==='PUT'){Object.assign(d.operator,payload);Object.assign(d.branding,payload);}
   v={operator:d.operator,branding:d.branding};
 }else if(p.startsWith('/api/settings/branding/assets/'))v={success:true};
 else if(p==='/api/settings/whatsapp'){if(method==='PUT')Object.assign(d.wa,payload);v=d.wa;}
 else if(p==='/api/settings/configuration'){if(method==='PUT')Object.assign(d.config,payload);v=d.config;}
 else if(p==='/api/settings')v=d.settings;
 else if(p.startsWith('/api/settings/')){const key=p.split('/').pop();if(method==='PUT')d.settings[key]=payload;v=d.settings[key]||{};}
 else if(p==='/api/notifications/subscriptions')v={subscriptions:d.subs,events:['booking.created','trip.delayed'],channels:['push','sms','email','whatsapp']};
 else if(p.startsWith('/api/notifications/subscriptions/'))v={success:true};
 else if(p==='/api/history')v=[];
 if(method!=='GET')window.__mutations.push({method,p,payload});
 return new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});
};
'''.replace('DATA_HERE',json.dumps(D,ensure_ascii=False))
html='<html lang="en"><head><meta charset="utf-8"><style>'+style+'</style></head><body><div id="app"></div><div id="modal-root"></div><div id="toasts"></div><script>'+stub+'</script>'+''.join('<script>'+ (ROOT/(src.lstrip('/'))).read_text().replace('</script>','<\\/script>') +'</script>' for src in scripts)+'</body></html>'
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1776,'height':940})
 errs=[]
 page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(html,wait_until='load')
 try:page.locator('.stp-table-row').first.wait_for(timeout=10000)
 except Exception:
  print('PAGE TEXT:',page.locator('body').inner_text()[:2500]);print('JS ERRORS',errs);raise
 print('TEAM rows',page.locator('.stp-table-row').count())
 page.screenshot(path=str(OUT/'Settings_v16_OfficeStaff_browser.png'),full_page=True)
 page.locator('[data-settings-btn]').click()
 page.screenshot(path=str(OUT/'Settings_v16_SettingsDropdown_browser.png'),full_page=False)
 page.locator('[data-settings-btn]').click()
 page.locator('a[href="#/settings/team-access/access"]').click()
 page.locator('.stp-perm-card').first.wait_for(timeout=10000)
 print('Permission rows',page.locator('.stp-perm-row').count())
 page.screenshot(path=str(OUT/'Settings_v16_AccessRoles_browser.png'),full_page=True)
 page.evaluate("location.hash='#/settings/branding'")
 page.locator('[data-brand-save]').wait_for(timeout=10000)
 page.screenshot(path=str(OUT/'Settings_v16_Branding_browser.png'),full_page=True)
 page.locator('[data-brand="appName"]').fill('JourneyOS Updated')
 page.locator('[data-brand-save]').click()
 page.wait_for_timeout(150)
 assert page.evaluate("window.__mutations.some(x=>x.p==='/api/settings/branding'&&x.method==='PUT')"),'no branding save'
 print('Brand save mutation PASS')
 page.evaluate("location.hash='#/settings/team-access/office-staff'")
 page.locator('[data-page-action]').click()
 page.locator('.stp-modal [name="name"]').fill('Test Employee')
 page.locator('.stp-modal [name="phone"]').fill('9000000123')
 page.locator('[data-modal-save]').click()
 page.wait_for_timeout(200)
 assert page.evaluate("window.__mutations.some(x=>x.p==='/api/iam/users'&&x.method==='POST')"),'no user create'
 print('User create mutation PASS')
 for sub,selector in [('configuration/notifications','[data-notification-add]'),('whatsapp','[data-wa-add]'),('loyalty-program/miles','[data-save-miles]'),('my-devices','[data-revoke-session]'),('about','[data-about-reload]')]:
  page.evaluate("location.hash='#/settings/'+"+json.dumps(sub))
  page.locator(selector).wait_for(timeout=10000)
  print(sub,'render PASS')
 # Role permission controls trigger a real API write (mocked) instead of a visual-only toast.
 page.evaluate("location.hash='#/settings/team-access/access/roles/viewer'")
 page.locator('[data-save-role]').wait_for(timeout=10000)
 page.locator('[data-perm-toggle]').first.click()
 page.locator('[data-save-role]').click()
 page.wait_for_timeout(100)
 assert page.evaluate("window.__mutations.some(x=>x.p==='/api/iam/roles/viewer'&&x.method==='PUT')"),'role save missing'
 print('Role permission save mutation PASS')
 # Branch creation and immediate table refresh.
 page.evaluate("location.hash='#/settings/team-access/branches'")
 page.locator('[data-create-branch]').click()
 page.locator('.stp-modal [name="name"]').fill('New Test Office')
 page.locator('.stp-modal [name="city_id"]').select_option('107258')
 page.locator('[data-modal-save]').click()
 page.wait_for_timeout(100)
 assert page.evaluate("window.__mutations.some(x=>x.p==='/api/branches'&&x.method==='POST')"),'branch create missing'
 print('Branch add mutation PASS')
 # Create and persist a WhatsApp template while disconnected.
 page.evaluate("location.hash='#/settings/whatsapp'")
 page.locator('[data-wa-add]').click()
 page.locator('.stp-modal [name="name"]').fill('Boarding reminder')
 page.locator('.stp-modal [name="message"]').fill('Please reach pickup 15 minutes early.')
 page.locator('[data-modal-save]').click()
 page.wait_for_timeout(100)
 assert page.evaluate("window.__mutations.some(x=>x.p==='/api/settings/whatsapp'&&x.method==='PUT')"),'WA template save missing'
 print('WhatsApp template local save mutation PASS')
 # Loyalty rules are updated through the existing settings API.
 page.evaluate("location.hash='#/settings/loyalty-program/miles'")
 page.locator('[data-save-miles]').click()
 page.wait_for_timeout(100)
 assert page.evaluate("window.__mutations.some(x=>x.p==='/api/settings/miles'&&x.method==='PUT')"),'miles save missing'
 print('Loyalty save mutation PASS')
 # Language selector persists chosen value.
 page.locator('[data-language-btn]').click()
 page.locator('[data-language-option="हिन्दी"]').click()
 assert page.evaluate("localStorage.getItem('stp_language')==='हिन्दी'"),'language selection not persisted'
 print('Language selector persistence PASS')
 # Route-level smoke: all visible Settings destinations and tab variants must render.
 routes=[
 ('team-access/office-staff','.stp-table-row'),('team-access/bus-staff','.stp-top-tabs'),
 ('team-access/agents','.stp-table-row'),('team-access/branches','.stp-top-tabs'),
 ('team-access/access/roles/viewer','.stp-perm-card'),
 ('team-access/access/test-access/viewer','[data-test-access]'),
 ('team-access/access/groups/viewer','[data-add-group]'),
 ('team-access/access/advanced/viewer','[data-save-limits]'),
 ('branding','[data-brand-save]'),
 ('configuration/notifications','[data-notification-add]'),
 ('configuration/alerts','[data-config-save]'),
 ('configuration/calling','[data-calling-save]'),
 ('configuration/bot','[data-config-save]'),
 ('whatsapp','[data-wa-add]'),
 ('loyalty-program/miles','[data-save-miles]'),
 ('loyalty-program/day-rates','[data-save-dayrates]'),
 ('loyalty-program/tiers','[data-save-tiers]'),
 ('loyalty-program/blackouts','[data-add-blackout]'),
 ('loyalty-program/upgrades','[data-save-upgrades]'),
 ('switch-user','[data-switch-confirm]'),('change-password','[data-logout-account]'),
 ('my-devices','[data-revoke-session]'),('about','[data-about-reload]')]
 for route,marker in routes:
  page.evaluate("location.hash='#/settings/'+"+json.dumps(route))
  page.locator(marker).first.wait_for(timeout=10000)
 print('Settings destinations + tabs rendered:',len(routes))
 print('JS errors',errs)
 assert not errs,errs
 browser.close()
 print('PASS Settings v16 browser smoke with mocked API')
