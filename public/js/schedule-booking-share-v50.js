/* v50 — Schedule Seat Layout Share as passenger booking URL + WhatsApp-ready text.
 * The server validates operator-owned HTTPS booking base and actual route city IDs.
 * No internal GDS URL, fabricated direct-service deep link, PNR or passenger data. */
(function(root,factory){
 'use strict';
 const api=factory(root||{});
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ScheduleBookingShareV50=api;
})(typeof window!=='undefined'?window:null,function(root){
 'use strict';
 function validate(response){
  if(!response||typeof response.message!=='string'||typeof response.booking_url!=='string')
   throw new Error('Booking-link response is incomplete');
  let link;
  try{link=new URL(response.booking_url)}catch(_){throw new Error('Booking link is not a valid URL')}
  if(link.protocol!=='https:'||link.username||link.password||
     !link.searchParams.get('fromCity')||!link.searchParams.get('toCity')||
     !/^\d{4}-\d{2}-\d{2}$/.test(link.searchParams.get('journeyDate')||'')||
     !response.message.endsWith(response.booking_url)||
     response.link_type!=='route_date_search')
   throw new Error('Booking link is not a verified route/date search URL');
  return response;
 }
 const escaped=v=>String(v||'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 function fallbackMarkup(message){
  return '<p>Copy this route and travel-date booking message, then paste it into WhatsApp or any chat. '+
   'Your WhatsApp app may create the website preview automatically.</p>'+
   '<textarea data-sx50-message readonly rows="5" spellcheck="false" aria-label="Passenger booking link message" '+
   'style="width:100%;min-height:110px;font:inherit;resize:vertical;border:1px solid #cad4ec;border-radius:10px;padding:12px">'+escaped(message)+'</textarea>'+
   '<p class="sx-muted">This opens the operator’s booking website search for the selected route and date. '+
   'It does not preselect a particular bus unless the booking site supports that separately.</p>'+
   '<button type="button" class="btn primary" data-sx50-copy>Copy booking message</button>';
 }
 async function copyDirect(message,{env=root,selectedElement}={}){
  const value=String(message||'');
  if(!value)throw new Error('Booking message unavailable');
  // Do not await anything before calling the clipboard from this click.
  try{
   if(env.navigator?.clipboard?.writeText){
    await env.navigator.clipboard.writeText(value);
    return true;
   }
  }catch(_){/* legacy selection fallback below */}
  const field=selectedElement;
  if(!field||typeof field.select!=='function'||!env.document?.execCommand)return false;
  field.focus();field.select();
  try{return env.document.execCommand('copy')===true}catch(_){return false}
 }
 async function copy(fetchData,{env=root}={}){
  if(typeof fetchData!=='function')throw new Error('Booking-link fetcher required');
  // Start browser clipboard WRITE before the first await so transient user
  // activation survives the asynchronous authenticated API request.
  const responsePromise=Promise.resolve().then(fetchData).then(validate);
  const textBlob=responsePromise.then(r=>new env.Blob([r.message],{type:'text/plain'}));
  let item=null;
  if(env.ClipboardItem&&env.navigator?.clipboard?.write){
   try{item=new env.ClipboardItem({'text/plain':textBlob})}
   catch(_){/* browsers without Promise<Blob> support use plain-text fallback */}
  }
  if(item){
   try{
    await env.navigator.clipboard.write([item]);
    const response=await responsePromise;
    return {...response,copied:true,manual:false};
   }catch(_){/* try writeText after fetch; then offer manual selection */}
  }
  const response=await responsePromise;
  if(env.navigator?.clipboard?.writeText){
   try{
    await env.navigator.clipboard.writeText(response.message);
    return {...response,copied:true,manual:false};
   }catch(_){/* caller shows visible manual-copy modal */}
  }
  return {...response,copied:false,manual:true};
 }
 return{copy,copyDirect,validate,fallbackMarkup};
});
