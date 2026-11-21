#!/usr/bin/env python3
"""Fixture-only interactive browser contract test for Schedules v6. No real bookings."""
import os, json, threading, functools, http.server, pathlib, datetime, time
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
DATE=datetime.datetime.now().strftime('%Y-%m-%d')
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def serve():
 h=functools.partial(Quiet,directory=str(BASE/'public'))
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),h)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 return server

sch={'id':1,'route_id':1,'service_number':'NTHB1','service_name':'Rajahuli','origin':'Hyderabad','destination':'Bengaluru','departure_time':'17:30','arrival_time':'07:55','arrival_day_offset':1,'travel_date':DATE,'coach':'A/C Seater/Sleeper (2+1)','vehicle':{'id':7,'registration_number':'AR 01 Q 7827'},'status':'active','seats_booked':3,'capacity':46,'occupancy_pct':6.52,'revenue':3500,'counts':{'hold':1},'crew':[{'role':'Driver','staff_id':1,'name':'Gousuddin','phone':'9000000001'},{'role':'Helper','staff_id':2,'name':'Rehan','phone':'9000000002'}], 'sync_with_route':True,'main_fare':{'seater':600,'sleeper_lower':799,'sleeper_upper':849}}
stages=[{'id':11,'type':'pickup','name':'LB Nagar Metro Station','city_id':1,'day':1,'time':'17:45','contact_number':'9000000000','landmark':'Free metro Pickup','lat':17.349,'lng':78.548}, {'id':12,'type':'pickup','name':'Miyapur KS Bakers','city_id':1,'day':1,'time':'19:30','contact_number':'9000000000','lat':17.494,'lng':78.392}, {'id':13,'type':'drop','name':'Chikkaballapura Bypass','city_id':3,'day':2,'time':'05:35','landmark':'Near Pranav Hotel','lat':13.448,'lng':77.736}]
route={'id':1,'service_number':'NTHB1','name':'Rajahuli','via_cities':[{'city_id':1,'name':'Hyderabad','day':1,'time':'17:30'},{'city_id':2,'name':'Kurnool','day':2,'time':'00:45'},{'city_id':3,'name':'Bengaluru','day':2,'time':'07:55'}],'stages':stages}
mapdata={'decks':[{'deck':'LOWER','cols':3,'rows':4,'seats':[{'code':'1L','type':'sleeper','status':'available','row':0,'col':0,'w':1,'h':2,'fare':950},{'code':'1','type':'seater','status':'booked','row':0,'col':1,'w':1,'h':1,'fare':600,'booking':{'pnr':'094098','name':'Rohit','gender':'male'}},{'code':'2','type':'seater','status':'available','row':0,'col':2,'w':1,'h':1,'fare':600},{'code':'2L','type':'sleeper','status':'blocked','row':2,'col':0,'w':1,'h':2,'fare':950}]},{'deck':'UPPER','cols':3,'rows':4,'seats':[{'code':'3U','type':'sleeper','status':'female','row':0,'col':0,'w':1,'h':2,'fare':1300},{'code':'2U','type':'sleeper','status':'available','row':0,'col':1,'w':1,'h':2,'fare':1400},{'code':'1U','type':'sleeper','status':'available','row':0,'col':2,'w':1,'h':2,'fare':1400}]}]}
passengers=[{'pnr':'094098','name':'Rohit','seat':'1','status':'boarded','phone':'9000000003','from':'Hyderabad','to':'Bengaluru','source':'redbus','boarding':{'id':11,'name':'LB Nagar Metro Station','time':'17:45'},'dropping':{'id':13,'name':'Chikkaballapura Bypass','time':'05:35'},'trips':3,'fare':600}]
history=[{'pnr':'094098','contact_name':'Rohit','status':'confirmed','source':'redbus','passengers':[{'name':'Rohit','seat':'1'}],'total_amount':600,'blocked_at':DATE+'T15:00:00Z'}]
pnl={'service':'NTHB1','route':'Hyderabad → Bengaluru','date':DATE,'vehicle':'AR 01 Q 7827','seats':3,'capacity':46,'occupancy_pct':6.52,'net_sales':3500,'expense':2500,'profit':1000,'gst':175,'commission':300,'cancellation_charges':0,'by_channel':[{'channel':'redbus','seats':3,'net':3500}], 'expense_breakdown':{'fixed':800,'running':1700,'items':[{'label':'Insurance','type':'fixed','per_day':800},{'label':'Diesel','type':'running','per_day':1700}]}}
API={'/api/schedules/1':{**sch,'route':route,'seat_blocks':[],'fare_synced':True},'/api/trips/1':{**sch,'stops':stages,'passengers':passengers,'position':{'lat':17.385,'lng':78.486,'address':'Balaji Nagar, Kukatpally, Medchal Malkajgiri'}},'/api/schedules/1/booking-history':{'history':history},'/api/schedules/1/fares':{'synced':True,'fares':[{'from_city_id':1,'to_city_id':3,'from':'Hyderabad','to':'Bengaluru','seater':600,'sleeper_lower':950,'sleeper_upper':1300}], 'auto_pricing':{'min':650,'max':4500}},'/api/schedules/1/pnl':pnl,'/api/schedules/1/history':{'history':[{'at':DATE+'T15:00:00Z','section':'crew','name':'Test','changes':{}}]},'/api/vehicles':{'vehicles':[{'id':7,'registration_number':'AR 01 Q 7827'}]},'/api/staff':{'staff':[{'id':1,'name':'Gousuddin','phone':'9000000001'},{'id':2,'name':'Rehan','phone':'9000000002'}]}}
API_LIST={'from':DATE,'to':DATE,'schedules':[sch]}
mainstub='''G.user={name:"Test",phone:"9000000000",permissions:["schedules.view","schedules.modify","schedules.toggle","schedules.financial","schedules.fares","bookings.block_seats","bookings.create","bookings.view_all","trips.view","trips.notify","staff.view","fleet.view","routes.view"]};G.operator={operator_name:"Test operator"};const body=document.getElementById('app');G.screens.gds(body,{tab:"schedules"});'''

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1480,'height':900},device_scale_factor=1)
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  page.set_content('<html><head></head><body><main id="app"></main><div id="modal-root"></div><div id="toasts"></div></body></html>')
  page.evaluate('''()=>{const db={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}})}''')
  page.add_style_tag(path=str(BASE/'public/css/app.css'))
  page.add_style_tag(path=str(BASE/'public/css/schedules-screenshot-v6.css'))
  page.add_style_tag(path=str(BASE/'public/css/routes-schedules-visual-v7.css'))
  page.add_script_tag(path=str(BASE/'public/js/core.js'))
  fixture={'API':API,'API_LIST':API_LIST,'mapdata':mapdata}
  page.evaluate('''(fixture)=>{
    G.user={name:'Test',phone:'9000000000',permissions:['schedules.view','schedules.modify','schedules.toggle','schedules.delete','schedules.financial','schedules.fares','bookings.block_seats','bookings.create','bookings.view_all','trips.view','trips.notify','staff.view','fleet.view','routes.view']};
    G.screens.gds=async()=>{};
    G.get=async path=>{
      if(path.startsWith('/schedules?'))return fixture.API_LIST;
      if(path.startsWith('/schedules/1/seat-layout'))return fixture.mapdata;
      if(path.startsWith('/staff?'))return fixture.API['/api/staff'];
      const r=fixture.API['/api'+path];if(r)return r;
      throw new Error('Fixture missing '+path);
    };
    G.post=async()=>({success:true});G.put=async()=>({success:true});G.del=async()=>({success:true});
    G.bookingConsole=async()=>{};G.bookingModal=async()=>{};
    G.confirm=async()=>false;G.toast=(message)=>{window.lastToast=message};
  }''',fixture)
  page.add_script_tag(path=str(BASE/'public/js/schedules-screenshot-v6.js'))
  page.evaluate('''()=>G.screens.gds(document.getElementById('app'),{tab:'schedules'})''')
  page.locator('[data-sx-open="1"]').first.wait_for(timeout=15000)
  assert page.locator('.sx-main-table thead th').count()==8
  assert page.locator('[data-sx-delete]').count()==1, 'Missing status-bin action from source screenshot'
  assert 'Delete schedule' in page.locator('[data-sx-delete]').first.get_attribute('title')
  assert page.locator('.sx-main-table tbody tr').first.evaluate('(e)=>Math.round(e.getBoundingClientRect().height)')>=120
  assert page.locator('.sx-main-table thead th').first.evaluate('(e)=>Math.round(e.getBoundingClientRect().height)')>=45
  page.locator('[data-sx-sort="collection"]').click()
  assert page.locator('[data-sx-sort="collection"][aria-pressed="true"]').count()==1
  page.locator('[data-sx-today]').click()
  assert page.locator('[data-sx-calendar-popup]').is_visible()
  page.locator('[data-sx-jump-today]').click()
  assert not page.locator('[data-sx-calendar-popup]').is_visible()

  page.screenshot(path=str(BASE/'reports/schedules_v6_list_preview.png'),full_page=True)
  page.locator('[data-sx-open-tab="bookings"]').first.click()
  page.locator('[data-sx-tab="fares"]').wait_for()
  page.locator('[data-sx-summary]').first.wait_for(timeout=12000)
  assert page.locator('.sx-seat').count()==7
  assert page.locator('[data-sx-summary]').count()>=5
  page.screenshot(path=str(BASE/'reports/schedules_v6_booking_preview.png'))
  for k in ['block','update','cities','pickups','drops','fares','pnl','history','bookings']:
   page.locator('[data-sx-tab="%s"]'%k).click()
   page.wait_for_timeout(250)
   assert page.locator('[data-sx-modal-body]').inner_text().strip(),k
   assert page.locator('[data-sx-tab="%s"].on'%k).count()==1,k
   if k=='fares':page.screenshot(path=str(BASE/'reports/schedules_v6_fares_preview.png'))
   if k=='update':page.screenshot(path=str(BASE/'reports/schedules_v6_update_preview.png'))
  page.locator('[data-sx-summary="pickups"]').click()
  page.locator('.sx-popoverlay .hd').wait_for()
  page.locator('.sx-popoverlay [data-x]').click()
  page.locator('[data-sx-tab="update"]').click()
  page.locator('[data-sx-editassign]').click()
  assert page.locator('[data-sx-assignment-form]').is_visible()
  page.locator('[data-sx-close]').first.click()
  assert page.locator('.sx-backdrop').count()==0
  print('PASS Schedules v6: eight-column date grid, nine tabs, booking seat chart, summaries, crew editor, close; JS pageerrors:',errs)
  assert not errs,errs
  browser.close()
if __name__=='__main__':run()
