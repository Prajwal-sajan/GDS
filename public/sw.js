/* JourneyOS GDS: network-only PWA lifecycle.
   Security: never cache authenticated pages, API responses, PNRs, or seat data. */
self.addEventListener('install',()=>{ /* activate only when user accepts an update */ });
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.mode!=='navigate')return;
 if(new URL(event.request.url).origin!==self.location.origin)return;
 // Network-only, so no stale operator data is cached for a signed-out user.
 event.respondWith(fetch(event.request));
});
