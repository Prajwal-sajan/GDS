"""Isolated CRM browser visual and interaction regression. Fixtures are synthetic; no live customers."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'reports';REPORT.mkdir(exist_ok=True)
FIXTURE={
 'query':'543210',
 'customers':[{'phone':'9000054321','name':'Demo Passenger','email':'demo@example.test','tier':'Silver','miles':1800,'total_trips':3,'total_bookings':4,'cancelled':1,'upcoming':1,'cancellation_pct':25,'spend':5169.24,'last_travel':'2026-11-20','last_route':{'from':'Metro Pickup','to':'City Center'},'bookings':[]}],
 'bookings':[{'pnr':'543210','ticket_number':'ST1234567890543210','service':'NTHB1','source':'redbus','status':'confirmed','payment':'paid','payment_method':'online','travel_date':'2026-11-20','booked_at':'2026-11-17T09:44:00Z','passengers':[{'seat':'15U','name':'Demo Passenger','gender':'M','age':20,'fare':1649}], 'seat_codes':['15U'],'fare':{'gross':1649,'discount':82.45,'gst':78.33,'total':1644.88,'commission':241.88}, 'amount':1644.88,'from':'Metro Pickup','to':'City Center','boarding':{'name':'Metro Pickup','time':'18:05','day':1},'dropping':{'name':'City Center','time':'07:00','day':2},'contact':{'name':'Demo Passenger','phone':'9000054321','email':'demo@example.test'},'schedule_id':1,'route_id':1}]}
MAP={'decks':[{'deck':'LOWER','rows':8,'cols':4,'seats':[{'code':f'{i}L','row':i-1,'col':0,'h':2,'fare':800,'status':'booked_female' if i%2 else 'booked_male'} for i in range(1,5)]+[{'code':str(i),'row':(i-1)//2,'col':2+((i-1)%2),'fare':650,'status':'available'} for i in range(1,7)]},{'deck':'UPPER','rows':8,'cols':3,'seats':[{'code':f'{i}U','row':i-1,'col':0,'h':2,'fare':1450,'status':'booked_male'} for i in range(1,5)]+[{'code':'15U','row':5,'col':0,'h':2,'fare':1649,'status':'booked_male'}]+[{'code':f'{i}U','row':i-1,'col':2,'h':2,'fare':1100,'status':'booked_female'} for i in range(1,5)]}]}
def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1790,'height':900},device_scale_factor=1)
  page.set_content('<html><body><div id="mount" style="margin:18px auto;max-width:1650px"></div></body></html>')
  page.add_style_tag(path=str(ROOT/'public/css/app.css'))
  page.add_style_tag(path=str(ROOT/'public/css/crm-screenshot-v8.css'))
  page.add_script_tag(content='''var esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));var can=()=>true;var addDays=(x,n)=>x; var G={screens:{},query:()=>({}),qs:o=>new URLSearchParams(o).toString(),get:async p=>{window.requests.push(p);if(p.startsWith('/crm/passenger-search'))return JSON.parse(JSON.stringify(window.fixture));if(p.startsWith('/crm/booking/'))return {booking:window.fixture.bookings[0],map:window.seatMap,history:[]};return {schedules:[]}},post:async()=>({sent:1}),put:async()=>({}),confirm:async()=>false,prompt:async()=>null,toast:(...x)=>{window.toast=x},err:e=>{window.err=e.message},callNow:()=>{window.called=true}};window.G=G;window.requests=[];''')
  page.evaluate('(f)=>{window.fixture=f;window.seatMap=JSON.parse(arguments[0]||"null") if(false){} }' if False else '(f)=>{window.fixture=f}',FIXTURE)
  page.evaluate('(m)=>window.seatMap=m',MAP)
  page.add_script_tag(path=str(ROOT/'public/js/crm-screenshot-v8.js'))
  page.evaluate('G.screens.crm(document.querySelector("#mount"),{})')
  page.get_by_text('Passenger Search').wait_for()
  assert page.locator('.cv8-customer').count()==0,'CRM must not list customers before explicit search'
  assert page.evaluate('window.requests.length')==0,'CRM must not fetch customers before search'
  page.locator('[data-cv8-q]').fill('543210'); page.locator('.cv8-searchform .cv8-primary').click()
  page.get_by_text('Demo Passenger').first.wait_for()
  assert page.locator('.cv8-customer').count()==1
  assert 'trip' in page.locator('.cv8-countbar').inner_text()
  assert page.locator('tbody tr.cv8-ticketrow').count()==1
  assert page.locator('.cv8-searchpanel .cv8-status-tabs button').count()==4
  page.screenshot(path=str(REPORT/'CRM_V8_SEARCH_PREVIEW.png'),full_page=True)
  page.locator('[data-cv8-filter="cancelled"]').click();assert page.locator('.cv8-tickets tbody tr.cv8-ticketrow').count()==0
  page.locator('[data-cv8-filter="all"]').click();page.locator('[data-cv8-booking]').first.click()
  page.get_by_text('Book Seats - NTHB1').wait_for()
  assert page.locator('.cv8-deck').count()==2
  assert page.locator('.cv8-seat').count()>=10
  assert page.get_by_text('Contact & Journey Details').count()==1
  assert page.get_by_text('Passenger Information').count()==1
  page.screenshot(path=str(REPORT/'CRM_V8_BOOKING_PREVIEW.png'),full_page=True)
  page.locator('[data-cv8-action="notify-toggle"]').click()
  assert page.locator('[data-cv8-notifymenu]:visible button').count()==4
  page.screenshot(path=str(REPORT/'CRM_V8_NOTIFY_PREVIEW.png'),full_page=True)
  page.locator('[data-cv8-action="notify-toggle"]').click()
  page.locator('.cv8-dialog-side').evaluate('(e)=>e.scrollTop=e.scrollHeight')
  page.screenshot(path=str(REPORT/'CRM_V8_FARE_PREVIEW.png'),full_page=True)
  assert page.get_by_text('Total Payable').count()==1
  page.locator('.cv8-dialog-close').click();assert page.locator('.cv8-overlay').count()==0
  page.locator('[data-cv8-mode="email"]').click()
  assert page.locator('.cv8-customer').count()==0
  page.locator('[data-cv8-q]').fill('demo@example.test');page.locator('.cv8-searchform .cv8-primary').click()
  assert page.locator('.cv8-customer').count()==1
  page.locator('[data-cv8-mode="phone"]').click();page.locator('[data-cv8-q]').fill('9000054321');page.locator('.cv8-searchform .cv8-primary').click()
  assert page.locator('.cv8-customer').count()==1
  assert page.evaluate('window.__CRM_SCREENSHOT_V8__')
  print('PASS CRM v8: explicit search gate, Phone/Email/PNR modes, status filters, customer metrics, booking overlay, seat decks, Notify menu, fare scrolling and close')
  browser.close()
if __name__=='__main__':main()
