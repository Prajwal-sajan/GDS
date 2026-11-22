'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"><div data-content></div></div>',{url:'https://gds.example.test/#/settings/whatsapp',runScripts:'outside-only'});
const w=dom.window,root=w.document.querySelector('[data-content]');
Object.defineProperty(w,'isSecureContext',{value:true,configurable:true});
let oldCount=0,started=0,finished=0,registration=0,disconnections=0;
let fbCallback=null,fbOpts=null;
let state='not_connected',connected=false;
let enabled=true;
w.FB={
 login(fn,options){fbCallback=fn;fbOpts=options;},
 init(){}
};
w.confirm=()=>true;
w.G={
 screens:{settings:async()=>{oldCount++;}},
 get:async url=>{
  assert.equal(url,'/settings/whatsapp/onboarding');
  return {enabled,app_id:enabled?'123456789012345':null,configuration_id:enabled?'234567890123456':null,
   graph_version:'v24.0',connection:{status:state,business_name:'Example Operator',
   waba_id:'12345678900123',phone_number_id:'22345678900123',display_phone_number:'+91 98765 43210',
   connected_at:state==='connected'?'2026-11-23T12:34:00Z':null}};
 },
 post:async (url,payload)=>{
  if(url.endsWith('/start')){started++;return {state:'nonce'+started,app_id:'123456789012345',configuration_id:'234567890123456'};}
  if(url.endsWith('/finish')){finished++;assert.equal(payload.waba_id,'12345678900123');
   assert.equal(payload.phone_number_id,'22345678900123');assert.equal(payload.code,'exchange_this_code');
   assert.ok(/^nonce\d+$/.test(payload.state));state='pending_registration';return {connection:{status:state}};}
  if(url.endsWith('/register')){registration++;assert.equal(payload.pin,'123456');
   state='connected';return {notice:'Registration confirmed'};}
  if(url.endsWith('/disconnect')){disconnections++;assert.equal(payload.confirm,'DISCONNECT');state='not_connected';return {notice:'Disconnected'};}
  throw Error('Unexpected request: '+url);
 },
 syncHeaderParity:()=>{}
};
w.eval(fs.readFileSync('public/js/whatsapp-v33.js','utf8'));
const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
async function open(){await w.G.screens.settings(root,['whatsapp']);await wait();}
(async()=>{
 assert.equal(w.G.whatsappVersion,'v33');
 await w.G.screens.settings(root,['about']);assert.equal(oldCount,1);
 await open();
 assert.match(root.textContent,/WhatsApp/);
 assert.match(root.textContent,/Send tickets and trip updates from your own WhatsApp number/);
 for(const s of ['Log in with the Facebook account of your business owner.',
  'Create or pick your business, and enter the details exactly as on your GST certificate.',
  'Add the phone number for WhatsApp and verify it with the code Meta sends.',
  'Add a payment card for WhatsApp messages, when Meta asks.',
  'The number can’t already be on the WhatsApp or WhatsApp Business app.',
  'Your passengers keep getting messages from the current number until you switch over.'])
  assert.ok(root.textContent.includes(s),'Missing reference detail: '+s);
 assert.equal(root.querySelectorAll('.wa33-steps li').length,4);
 assert.equal(root.querySelectorAll('[data-wa33-connect]').length,1);
 assert.equal(root.querySelectorAll('select').length,0,'No screenshot dropdown on this screen');
 assert.ok(started>=1,'Start state prepared before popup click');
 root.querySelector('[data-wa33-connect]').click();
 assert.ok(fbCallback,'Meta sign-in launched on user click');
 assert.equal(fbOpts.config_id,'234567890123456');
 assert.equal(fbOpts.response_type,'code');
 assert.equal(fbOpts.override_default_response_type,true);
 const spoof=new w.MessageEvent('message',{origin:'https://evil.example.test',
  data:JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'12345678900123',phone_number_id:'22345678900123'}})});
 w.dispatchEvent(spoof);
 fbCallback({authResponse:{code:'exchange_this_code'}});
 await wait();
 assert.equal(finished,0,'Untrusted postMessage origin ignored');
 const legit=new w.MessageEvent('message',{origin:'https://www.facebook.com',
  data:JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event:'FINISH',
   data:{waba_id:'12345678900123',phone_number_id:'22345678900123'}})});
 w.dispatchEvent(legit);await wait();
 assert.equal(finished,1);
 assert.ok(root.querySelector('[data-wa33-register]'));
 assert.match(root.textContent,/Meta authorization verified/);
 assert.match(root.textContent,/Example Operator/);
 const form=root.querySelector('[data-wa33-register]');
 form.elements.pin.value='123456';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await wait();
 assert.equal(registration,1);
 assert.match(root.textContent,/WhatsApp number connected with Meta/);
 assert.ok(root.querySelector('[data-wa33-disconnect]'));
 assert.ok(!root.querySelector('[data-wa33-connect]'));
 root.querySelector('[data-wa33-disconnect]').click();await wait();
 assert.equal(disconnections,1);
 assert.ok(root.querySelector('[data-wa33-connect]'));
 // Missing credentials give a clear setup notice, never a fake success.
 enabled=false;await open();
 root.querySelector('[data-wa33-connect]').click();
 assert.match(root.querySelector('[data-wa33-status]').textContent,/META_APP_ID/);
 assert.ok(!root.textContent.includes('Connected successfully'));
 const original=w.G.get;
 w.G.get=async()=>{throw Error('offline')};
 await w.G.screens.settings(root,['whatsapp']);
 assert.match(root.textContent,/Unable to load WhatsApp setup/);
 assert.ok(root.querySelector('[data-wa33-retry]'));
 w.G.get=original;
 const doc=fs.readFileSync('public/index.html','utf8');
 assert.ok(doc.includes('/css/whatsapp-v33.css?build=33'));
 assert.ok(doc.includes('/js/whatsapp-v33.js?build=33'));
 assert.ok(doc.indexOf('/js/whatsapp-v33.js')>doc.indexOf('/js/about-v32.js'));
 const css=fs.readFileSync('public/css/whatsapp-v33.css','utf8');
 assert.match(css,/\.wa33-icon/);
 assert.match(css,/\.wa33-button/);
 assert.match(css,/@media\(max-width:720px\)/);
 console.log('PASS WhatsApp v33 UI: complete screenshot wording, 4 instructions, no invented dropdowns, secure Meta popup & message origin, registration and disconnect, missing credentials and error retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
