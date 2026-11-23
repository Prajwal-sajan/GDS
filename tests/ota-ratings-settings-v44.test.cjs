'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-ratings-v44-'));
process.env.GDS_DATA_DIR = tmp;
const db = require('../server/db');
db.reset();
db.meta('operator', { id:'test-operator', operator_name:'QA Test' });
const router = require('../server/api/ota-ratings-settings-v44');

test('Daily Ops / Ratings settings: API, encryption and screenshot controls', async t => {
  const app = express();
  app.use(express.json());
  let perms = ['dailyops.view', 'settings.view', 'settings.modify'];
  app.use('/api', (req, _res, next) => {
    req.user = { id:1, real_user_id:1, name:'QA', permissions:perms };
    next();
  });
  app.use('/api', router);
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => setTimeout(resolve, 420));
    fs.rmSync(tmp, { recursive:true, force:true });
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, suffix, body) => {
    const response = await fetch(url + '/api/ota-ratings' + suffix, {
      method,
      headers:{ 'Content-Type':'application/json' },
      body:body === undefined ? undefined : JSON.stringify(body)
    });
    return { status:response.status, payload:await response.json(), headers:response.headers };
  };
  const first = await call('GET','/settings');
  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.payload.providers).sort(), ['abhibus','redbus']);
  assert.equal(first.payload.providers.abhibus.password_saved,false);
  assert.equal(first.payload.providers.abhibus.auto_fetch_active,false);
  assert.equal(first.payload.refresh_every_hours,3);
  assert.match(first.headers.get('cache-control'),/no-store/);

  const missingKey = await call('PUT','/settings/abhibus',{username:'qa-operator',password:'TEST_ONLY_secret'});
  assert.equal(missingKey.status,503);
  assert.equal(db.col('ota_rating_connections').count(),0);
  process.env.OTA_RATINGS_CREDENTIAL_KEY = Buffer.alloc(32,7).toString('hex');

  const saved = await call('PUT','/settings/abhibus',{username:'qa-operator',password:'TEST_ONLY_secret'});
  assert.equal(saved.status,200);
  assert.equal(saved.payload.settings.username,'qa-operator');
  assert.equal(saved.payload.settings.password_saved,true);
  assert.equal(saved.payload.settings.live_connector_available,false);
  assert.equal(JSON.stringify(saved.payload).includes('TEST_ONLY_secret'),false);
  const row = db.col('ota_rating_connections').all()[0];
  assert.equal(row.provider,'abhibus');
  assert.equal(row.password_encrypted.startsWith('v1:'),true);
  assert.equal(row.password_encrypted.includes('TEST_ONLY_secret'),false);

  const cipher = row.password_encrypted;
  const keep = await call('PUT','/settings/abhibus',{username:'qa-operator-updated',password:''});
  assert.equal(keep.status,200);
  assert.equal(row.password_encrypted,cipher);
  assert.equal(row.username,'qa-operator-updated');
  assert.equal(Object.hasOwn(row,'password'),false);

  const exposed = await call('GET','/settings');
  assert.equal(exposed.status,200);
  assert.equal(JSON.stringify(exposed.payload).includes('password_encrypted'),false);
  assert.equal(JSON.stringify(exposed.payload).includes('TEST_ONLY_secret'),false);
  assert.equal(exposed.payload.providers.redbus.username,'');
  assert.equal(exposed.payload.providers.redbus.password_saved,false);

  const invalid = await call('PUT','/settings/unknown',{username:'x',password:'abc'});
  assert.equal(invalid.status,400);
  const control = await call('PUT','/settings/redbus',{username:'invalid\u0000name',password:''});
  assert.equal(control.status,400);

  perms = ['dailyops.view','settings.view'];
  const forbidden = await call('PUT','/settings/abhibus',{username:'modified',password:''});
  assert.equal(forbidden.status,403);
  assert.equal(row.username,'qa-operator-updated');
  perms = ['dailyops.view','settings.modify'];
  const invisible = await call('GET','/settings');
  assert.equal(invisible.status,403);
  perms = ['dailyops.view','settings.view','settings.modify'];
  const unavailable = await call('POST','/refresh/abhibus',{});
  assert.equal(unavailable.status,409);
  assert.equal(unavailable.payload.code,'OTA_CONNECTOR_NOT_AVAILABLE');

  db.meta('operator',{id:'second-operator'});
  const separate = await call('GET','/settings');
  assert.equal(separate.payload.providers.abhibus.password_saved,false);
  db.meta('operator',{id:'test-operator'});

  const frontend = fs.readFileSync(path.join(__dirname,'../public/js/ota-ratings-v44.js'),'utf8');
  const daily = fs.readFileSync(path.join(__dirname,'../public/js/dailyops-parity-v12.js'),'utf8');
  const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const css = fs.readFileSync(path.join(__dirname,'../public/css/ota-ratings-settings-v44.css'),'utf8');
  new Function(frontend);
  new Function(daily);
  assert.ok(html.indexOf('/js/ota-ratings-v44.js') < html.indexOf('/js/dailyops-parity-v12.js'));
  assert.ok(html.includes('/css/ota-ratings-settings-v44.css'));
  assert.ok(daily.includes('ota.panelHtml('));
  assert.ok(daily.includes("if(a==='ota-save')"));
  assert.ok(daily.includes("if(a==='ota-cancel')"));
  assert.ok(daily.includes("if(a==='ota-provider')"));
  assert.ok(daily.includes("ota.matches(x)"));
  assert.ok(css.includes('.ds-ota-settings-grid'));

  let lastSave;
  const browser = { esc:value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;') };
  const fakeG = {
    get: async () => exposed.payload,
    put: async (endpoint, body) => {
      lastSave = { endpoint, body };
      return { settings:{username:body.username,password_saved:true} };
    },
    post: async () => { throw Error('OTA connector not available'); },
    toast: () => {}
  };
  vm.runInNewContext(frontend,{window:browser,G:fakeG});
  const ui = browser.OTARatingsV44;
  await ui.load();
  ui.toggle();
  const panel = ui.panelHtml(true);
  for (const phrase of ['AbhiBus (EDGE) login','EDGE username','EDGE password','edge.abhibus.com','Saved. Leave blank to keep it','Save','Cancel','RedBus']) {
    assert.ok(panel.includes(phrase),phrase);
  }
  assert.ok(panel.includes('type="password"'));
  assert.ok(panel.includes('data-ds-action="ota-save"'));
  assert.ok(panel.includes('data-ds-action="ota-cancel"'));
  assert.ok(ui.providerToggle().includes('aria-pressed="true"'));
  ui.chooseSettingsProvider('redbus');
  assert.ok(ui.panelHtml(true).includes('RedBus operator login'));
  ui.chooseSettingsProvider('abhibus');
  await ui.save({querySelector:selector => {
    if (selector === '[data-ds-ota-form]') return {
      querySelector: key => ({ value: key.includes('password') ? '' : 'qa-operator-updated' })
    };
    return null;
  }});
  assert.equal(lastSave.endpoint,'/ota-ratings/settings/abhibus');
  assert.equal(lastSave.body.password,'');
  assert.equal(ui.open,false);
  ui.chooseProvider('redbus');
  assert.equal(ui.matches({ota:'RedBus'}),true);
  assert.equal(ui.matches({ota:'AbhiBus'}),false);
  await ui.refresh();
  delete process.env.OTA_RATINGS_CREDENTIAL_KEY;
});
