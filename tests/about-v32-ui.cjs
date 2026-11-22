'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html='<div id="app"><div id="content"></div></div>';
const dom=new JSDOM(html,{url:'http://localhost:3000/#/settings/about',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,root=w.document.querySelector('#content');
const live={product:'JourneyOS Operator',version:'1.0.0',
 build_id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 commit:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',short_commit:'aaaaaaaa',
 built_at:'2026-11-23T12:34:00Z',committed_at:null,environment:'UAT',
 commit_url:'https://github.com/Prajwal-sajan/GDS/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 description:'The multi-tenant operator console for JourneyOS — manage GDS schedules, tripsheets, passenger chats, and bookings for your entire fleet from one place, on any device.',
 features:['GDS Schedules','Tripsheets','Passenger Chats','Bookings']};
let returned={...live},prev=0,called=0;
w.__GDS_SERVED_BUILD__=live.build_id;
w.can=()=>true;
w.G={screens:{settings:async()=>{prev++;}},get:async route=>{
  assert.equal(route,'/about/build');called++;return {...returned};
 },syncHeaderParity:()=>{},toast:()=>{}};
w.eval(fs.readFileSync('public/js/about-v32.js','utf8'));
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function open(){await w.G.screens.settings(root,['about']);return root;}
(async()=>{
 assert.equal(w.G.aboutVersion,'v32');
 await w.G.screens.settings(root,['configuration','business']);
 assert.equal(prev,1,'Other Settings routes preserve prior renderer');
 await open();
 assert.match(root.textContent,/JourneyOS Operator/);
 assert.match(root.textContent,/GDS Schedules/);
 assert.match(root.textContent,/Tripsheets/);
 assert.match(root.textContent,/Passenger Chats/);
 assert.match(root.textContent,/Bookings/);
 assert.match(root.textContent,/Build & Version/);
 assert.match(root.textContent,/Install app/);
 assert.match(root.textContent,/Check for updates/);
 assert.match(root.textContent,/UAT/);
 assert.match(root.textContent,/1\.0\.0\+aaaaaaaa/);
 assert.match(root.textContent,/Nov 23, 2026/);
 assert.equal(root.querySelectorAll('.ab32-feature').length,4);
 assert.equal(root.querySelectorAll('.ab32-row').length,3);
 assert.equal(root.querySelector('.ab32-hero h1').textContent,'JourneyOS Operator');
 assert.ok(root.querySelector('.ab32-domain').href.includes('localhost:3000'));
 assert.equal(root.querySelector('.ab32-row-commit').getAttribute('href'),live.commit_url);
 assert.equal(root.querySelector('.ab32-env').textContent.trim(),'UAT');
 assert.match(root.querySelector('.ab32-row:nth-child(2)').textContent,/BUILT/);
 // Check deployed server: no fake "update available" when same build.
 root.querySelector('[data-ab32-check]').click();await sleep();
 assert.match(root.querySelector('[data-ab32-status]').textContent,/latest version deployed on this server/i);
 assert.equal(root.querySelector('[data-ab32-check]').dataset.mode,undefined);
 // New SHA in the deployed server yields a user-controlled reload action.
 returned={...returned,build_id:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'};
 root.querySelector('[data-ab32-check]').click();await sleep();
 assert.equal(root.querySelector('[data-ab32-check]').dataset.mode,'reload');
 assert.match(root.querySelector('[data-ab32-check]').textContent,/Reload to update/);
 // A missing build fingerprint cannot be reported as up to date.
 await open();returned={...returned,build_id:null};
 root.querySelector('[data-ab32-check]').click();await sleep();
 assert.match(root.querySelector('[data-ab32-status]').textContent,/comparison unavailable/i);
 // Install button is not a fake successful action without browser install support.
 root.querySelector('[data-ab32-install]').click();await sleep();
 assert.match(root.querySelector('[data-ab32-install-status]').textContent,/HTTPS or localhost|browser menu|home screen/i);
 assert.doesNotMatch(root.querySelector('[data-ab32-install-status]').textContent,/installed successfully/i);
 // Prompt dispatch and user consent.
 let prompted=0;
 const evt=new w.Event('beforeinstallprompt',{cancelable:true});
 evt.prompt=()=>{prompted++;return Promise.resolve();};
 evt.userChoice=Promise.resolve({outcome:'dismissed'});
 w.dispatchEvent(evt);
 root.querySelector('[data-ab32-install]').click();await sleep();
 assert.equal(prompted,1);
 assert.match(root.querySelector('[data-ab32-install-status]').textContent,/dismissed/i);
 const second=new w.Event('beforeinstallprompt',{cancelable:true});
 second.prompt=()=>{prompted++;return Promise.resolve();};
 second.userChoice=Promise.resolve({outcome:'accepted'});
 w.dispatchEvent(second);
 root.querySelector('[data-ab32-install]').click();await sleep();
 assert.equal(prompted,2);
 assert.match(root.querySelector('[data-ab32-install-status]').textContent,/accepted/i);
 assert.doesNotMatch(root.querySelector('[data-ab32-install-status]').textContent,/installed successfully/i);
 w.dispatchEvent(new w.Event('appinstalled'));
 assert.ok(root.querySelector('[data-ab32-install]').disabled);
 assert.match(root.querySelector('[data-ab32-install]').textContent,/Installed/);
 assert.match(root.querySelector('[data-ab32-install-status]').textContent,/installed successfully/i);
 // Existing wrapper shows graceful failure and a real Retry button.
 const old=w.G.get;w.G.get=async()=>{throw Error('Offline');};
 await open();
 assert.match(root.textContent,/Unable to load About: Offline/);
 assert.ok(root.querySelector('[data-ab32-retry]'));
 w.G.get=old;
 const index=fs.readFileSync('public/index.html','utf8');
 const css=fs.readFileSync('public/css/about-v32.css','utf8');
 assert.ok(index.indexOf('about-v32.js')>index.indexOf('configuration-v31.js'));
 assert.match(css,/ab32-hero/);assert.match(css,/ab32-row-commit/);
 assert.match(css,/@media\(max-width:720px\)/);
 console.log('PASS About v32 UI: exact panels, feature links, metadata, UAT, update compare/reload state, install fallback/consent, error retry, responsive CSS, old route delegation; API calls '+called);
})().catch(e=>{console.error(e);process.exitCode=1;});
