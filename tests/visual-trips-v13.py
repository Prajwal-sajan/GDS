"""Offline Chromium screenshot & interaction tests. Browser page is assembled in memory;
no HTTP requests are needed for the GDS app, and mock trip values are visibly labeled."""
from pathlib import Path
import re,json,shutil,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'tests/trips-v13-browser-preview.html').read_text()
scripts=re.findall(r'<script(?:\s+src="([^"]+)")?>(.*?)</script>',html,re.S)
html=re.sub(r'<script(?:\s+src="[^"]+")?>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link[^>]*>','',html)
# The fixture uses /public/... asset URLs, which are not fetched in this offline browser.
styles=(ROOT/'public/css/app.css').read_text()+'\n'+(ROOT/'public/css/trip-parity-v13.css').read_text()
print('Offline fixture scripts',len(scripts))
with sync_playwright() as p:
 chrome=shutil.which('chromium') or shutil.which('google-chrome') or (r'C:\Program Files\Google\Chrome\Application\chrome.exe' if os.name=='nt' and os.path.exists(r'C:\Program Files\Google\Chrome\Application\chrome.exe') else None)
 browser=p.chromium.launch(headless=True,**({'executable_path':chrome} if chrome else {}),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1770,'height':1010},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded')
 page.add_style_tag(content=styles)
 page.add_script_tag(content="Object.defineProperty(window,'localStorage',{configurable:true,value:{_data:{},getItem(k){return this._data[k]||null},setItem(k,v){this._data[k]=String(v)},removeItem(k){delete this._data[k]}}});")
 for src,code in scripts:
  if src:
   relative=src.removeprefix('/public/')
   page.add_script_tag(content=(ROOT/'public'/relative).read_text())
  else: page.add_script_tag(content=code)
 page.locator('.tp13-stop').first.wait_for(timeout=10000)
 out=ROOT/'previews';out.mkdir(exist_ok=True)
 def shot(label):page.screenshot(path=str(out/f'{label}.png'),full_page=True)
 shot('trips-v13-pickup')
 assert page.locator('.tp13-tabs button').count()==4
 assert page.locator('.tp13-stop').count()>0
 assert page.locator('.tp13-pax-table tbody tr').count()>0
 print('PASS pickup render, stop cards and passengers')
 page.locator('[data-trip-customer]').first.click();page.locator('.tp13-customer-pop').wait_for();shot('trips-v13-customer-popover');print('PASS customer rating popover')
 page.locator('[data-trip-history]').first.click();page.locator('.tp13-history-modal').wait_for();shot('trips-v13-history');print('PASS communication history dialog')
 page.locator('.tp13-history-modal [data-x]').click()
 page.locator('[data-trip-tab="drop"]').click();assert page.locator('.tp13-stop.drop').count()>0;shot('trips-v13-drop');print('PASS drop workflow')
 page.locator('[data-trip-tab="timings"]').click();assert page.locator('.tp13-timing-table thead th').count()==7;shot('trips-v13-timings');print('PASS seven-column timings')
 page.locator('[data-trip-tab="docs"]').click();assert page.locator('.tp13-docbox').count()==2;shot('trips-v13-docs');print('PASS docs workflow')
 page.locator('[data-trip-tab="pickup"]').click();page.locator('[data-trip-map]').first.click();page.locator('.tp13-map-modal').wait_for();shot('trips-v13-map');print('PASS passenger map popup')
 page.locator('.tp13-map-modal [data-x]').click()
 page.locator('[data-trip-feedback]').first.select_option('call:called');page.locator('[data-trip-update]').first.click();page.wait_for_timeout(250);print('PASS feedback/update action')
 page.locator('[data-trip-collapse]').first.click();print('PASS group collapse action')
 if errors: raise AssertionError('Browser errors: '+json.dumps(errors))
 print('Trips v13 browser: 9 verification groups passed; 7 preview screenshots generated')
 browser.close()
