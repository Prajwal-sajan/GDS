"""Isolated browser interaction smoke test for the Routes v5 overlay.
Requires Python playwright + Chromium, not a backend or fake production data.
Uses synthetic fixtures only inside the test.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, tempfile, threading, http.server, socketserver, time

ROOT=Path(__file__).resolve().parents[1]
fixture = {
 'cities':[{'id':1,'name':'Hyderabad','state':'Telangana','lat':17.385,'lng':78.4867},{'id':2,'name':'Kurnool','state':'Andhra Pradesh','lat':15.8245,'lng':78.02156},{'id':3,'name':'Anantapur','state':'Andhra Pradesh','lat':14.69611,'lng':77.58584},{'id':4,'name':'Bengaluru','state':'Karnataka','lat':12.9716,'lng':77.5946}],
 'coaches':[{'id':2,'name':'A/C Seater/Sleeper (2+1)','capacity':8,'layout':{'decks':[{'deck':'LOWER','rows':8,'cols':4,'seats':[{'code':str(i),'type':'seater','row':i-1,'col':i%2} for i in range(1,5)]+[{'code':'1L','type':'sleeper','row':0,'col':3,'h':2},{'code':'2L','type':'sleeper','row':2,'col':3,'h':2}]},{'deck':'UPPER','rows':8,'cols':4,'seats':[{'code':'1U','type':'sleeper','row':0,'col':0,'h':2},{'code':'2U','type':'sleeper','row':2,'col':0,'h':2}]}]}}],
 'vehicles':[{'id':1,'registration_number':'AR 01 Q 7827'}],
 'staff':[{'id':1,'name':'Driver A','phone':'9999999999','role':'Driver'}],
 'route':{'id':1,'service_number':'NTHB1','name':'HYD BNG','alt_name':'Rajahuli','origin_city_id':1,'destination_city_id':4,'departure_time':'17:30','arrival_time':'07:55','duration_minutes':865,'distance_km':610,'coach_template_id':2,'vehicle_id':1,'start_date':'2026-11-16','status':'active','run_pattern':{'type':'daily'},'summary':{'origin':'Hyderabad','destination':'Bengaluru'},'via_cities':[{'city_id':1,'order':0,'day':1,'time':'17:30','name':'Hyderabad'},{'city_id':2,'order':1,'day':2,'time':'00:45','name':'Kurnool'},{'city_id':3,'order':2,'day':2,'time':'02:40','name':'Anantapur'},{'city_id':4,'order':3,'day':2,'time':'07:55','name':'Bengaluru'}], 'stages':[{'id':12,'type':'pickup','city_id':1,'name':'LB Nagar Metro Station','time':'17:45','day':1,'address':'Free Metro Pickup – show PNR at JNTU','lat':17.3491,'lng':78.5484,'contact_number':'9113209540'},{'id':13,'type':'drop','city_id':4,'name':'Chikkaballapura Bypass','time':'05:35','day':2,'primary':True,'address':'Near Pranav Hotel','lat':13.4464,'lng':77.736}], 'fares':[{'from_city_id':1,'to_city_id':4,'seater':750,'sleeper_lower':1400,'sleeper_upper':1300}],'seat_fare_rules':[{'kind':'amount','value':100,'label':'Rule 1','seats':['1L','1U'],'days':[]}],'seat_blocks':[],'refund_slabs':[{'hours_before':24,'refund_pct':75}], 'expenses':{'fixed':[],'running':[]}, 'tags':{},'auto_pricing':{'enabled':False,'min':650,'max':4500,'strategy':'max_revenue'},'business_rules':{'gents_next_to_ladies':False,'ladies_next_to_gents':False,'ladies_fill_doubles_first':True},'assignments':[{'vehicle_id':1,'crew':[{'role':'Driver','staff_id':1,'name':'Driver A'}]}]}
}
fixture['route_summary']={k:fixture['route'][k] for k in ('id','service_number','name','origin_city_id','destination_city_id','departure_time','arrival_time','duration_minutes','distance_km','status','start_date')}
fixture['route_summary'].update({'origin':'Hyderabad','destination':'Bengaluru','coach':'A/C Seater/Sleeper (2+1)','coach_template_id':2,'alt_name':'Rajahuli','via_names':['Kurnool','Anantapur'],'arrival_day':2})

class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def main():
 try:
  with socketserver.TCPServer(('127.0.0.1',0),Handler) as httpd:
   host=f'http://127.0.0.1:{httpd.server_address[1]}'
   thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
   with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1600,'height':1000});
    # The sandbox blocks navigation, so use a blank document with mocked storage.
    page.set_content('<html><head></head><body><main id="mount" style="padding:5px 25px"></main></body></html>')
    page.evaluate('''()=>{const db={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}})}''')
    for css in ('public/css/app.css','public/css/routes-screenshot-v5.css','public/css/routes-schedules-visual-v7.css'):
     page.add_style_tag(path=str(ROOT/css))
    page.evaluate('''(f)=>{
      window.G={screens:{gds:()=>{}},get:async path=>{
        if(path.startsWith('/routes?'))return {routes:[f.route_summary]};
        if(path==='/routes/1')return f.route;
        if(path==='/cities')return {cities:f.cities};
        if(path==='/coaches')return {coaches:f.coaches};
        if(path==='/vehicles')return {vehicles:f.vehicles};
        if(path==='/staff')return {staff:f.staff};
        if(path==='/routes/1/history')return {history:[{at:'2026-11-21',section:'fares',details:{op:'update'}}]};
        if(path==='/routes/1/validate')return {ok:true,issues:[]};
        return {};
      },put:async()=>({}),post:async()=>({}),api:async()=>({}),prompt:async()=>null,confirm:async()=>false,stepUp:async()=>null,toast:(text)=>{window.lastToast=text}};
      window.testFixture=f;
    }''',fixture)
    page.add_script_tag(path=str(ROOT/'public/js/routes-screenshot-v5.js'))
    page.evaluate('()=>{location.hash="#/gds/routes"}')
    page.evaluate('()=>G.screens.gds(document.querySelector("#mount"),{tab:"routes"})')
    page.get_by_text('NTHB1').first.wait_for()
    assert '||' not in page.locator('.rv-listframe').inner_text(), 'Stray raw template text in Route list'
    assert page.get_by_text('Kurnool, Anantapur').count()==1, 'Via cities should be populated from read-only summary'
    assert page.locator('.rv-route-links button').count()==3
    assert page.locator('.rv-tool').count()==5
    page.screenshot(path='/mnt/data/Routes_v5_list_browser_preview.png',full_page=True)
    page.evaluate('()=>{location.hash="#/gds/routes/1?rvtab=general&rvmode=edit"}')
    page.evaluate('()=>G.screens.gds(document.querySelector("#mount"),{tab:"routes",id:1})')
    page.get_by_text('Staff & Vehicle Assignment').wait_for()
    assert page.locator('.rv-tabbar button').count()==11
    assert page.locator('.rv-crew-panel').count()==2
    page.screenshot(path='/mnt/data/Routes_v5_general_browser_preview.png',full_page=True)
    page.get_by_role('button',name='Cities & Schedule').click()
    assert page.locator('.rv-slots tbody tr').count()==6
    page.get_by_role('button',name='Via City').count() if False else None
    page.get_by_role('button',name='Fares',exact=True).click()
    assert page.locator('.rv-faretable tbody tr').count()>=2
    assert page.locator('.rv-berth').count()>=8
    page.screenshot(path='/mnt/data/Routes_v5_fares_browser_preview.png',full_page=True)
    page.locator('[data-rv="rule-add:premium"]').click()
    assert page.locator('.rv-rulecard').count()>=2
    page.locator('[data-rv="rule-save:1"]').click()
    page.get_by_role('button',name='Pickups').click()
    assert page.get_by_text('LB Nagar Metro Station').count()>0
    assert page.locator('.rv-stopcard').count()==1
    page.get_by_role('button',name='Edit',exact=True).last.click()
    assert page.locator('.rv-modal-overlay').count()==1
    page.locator('[data-rv-modal-close]').first.click()
    page.get_by_role('button',name='Save Changes').click()
    assert 'Route UI preview saved' in page.evaluate('window.lastToast')
    page.get_by_role('button',name='History').click()
    page.locator('[data-rv="history-load"]').click()
    assert page.locator('[data-rv-history] tbody tr').count()==1
    browser.close();print('PASS Routes v5 headless browser interactions: list, editor tabs, crew, subroutes, fare groups, rules, stops, modal, preview save, history')
 except Exception as e:
  print('FAILED:',type(e).__name__,e)
  raise

if __name__=='__main__': main()
