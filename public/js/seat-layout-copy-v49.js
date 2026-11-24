/* v49 — Schedule → Manage → Bookings → Seat Layout → Copy
 * Self-contained SVG => high-density PNG => image/png ClipboardItem.
 * No third-party CDN, DOM screenshot, fare/phone/PNR export, or stale mock.
 * Clipboard write is initiated in the original click activation (before refresh
 * awaits) using a promise-backed ClipboardItem. Download is an honest fallback. */
(function(root,factory){
 'use strict';
 const api=factory(root||{});
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SeatLayoutCopyV49=api;
})(typeof window!=='undefined'?window:null,function(root){
 'use strict';
 const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&apos;'
 }[ch]));
 const int=(value,fallback)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback;
 const bound=(value,min,max)=>Math.max(min,Math.min(max,value));
 const formatDate=value=>{
  const date=String(value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return String(value||'Date unavailable');
  const d=new Date(date+'T12:00:00Z');
  return Number.isNaN(+d)?date:new Intl.DateTimeFormat('en-GB',{
   timeZone:'UTC',weekday:'short',day:'2-digit',month:'short',year:'numeric'
  }).format(d).replace(/(\b[A-Za-z]{3}) (\d{4})$/,'$1, $2');
 };
 function status(seat){
  const s=String(seat?.status||'').trim().toLowerCase(),booking=seat?.booking||null;
  const gender=String(booking?.gender||'').trim().toUpperCase();
  if(['booked_female','female'].includes(s))return 'female';
  if(['booked_male','male'].includes(s))return 'male';
  if(s==='booked'&&gender==='F')return 'female';
  if(s==='booked'&&gender==='M')return 'male';
  if(['blocked','hold','reserved','unavailable','not_available','no_show','other_leg','occupied'].includes(s))
   return 'unavailable';
  if(booking&&booking.overlaps===false)return 'unavailable';
  if(booking&&booking.overlaps!==false&&gender==='F')return 'female';
  if(booking&&booking.overlaps!==false&&gender==='M')return 'male';
  if(booking||s==='booked')return 'unavailable';
  return 'available';
 }
 function resolveGeometry(decks,helper){
  if(!Array.isArray(decks)||!decks.length||decks.length>2)
   throw new Error('A supported single- or double-deck seat layout is required');
  // Legacy stored 2+1 positions are visually projected the same way as v48
  // without mutating seat IDs, booking records or the fetched payload.
  const looks21=decks.length===2&&decks.some(d=>(d.seats||[]).some(s=>/^\d+L$/i.test(String(s.code))));
  let result=decks;
  if(looks21&&helper?.physicalGeometry)result=helper.physicalGeometry({decks});
  return result.map((deck,i)=>{
   const cols=int(deck.cols,0),rows=int(deck.rows,0);
   if(cols<2||cols>8||rows<1||rows>24)throw new Error('Invalid coach deck grid');
   const seats=deck.seats||[];
   if(!Array.isArray(seats)||!seats.length)throw new Error('Seat inventory is empty');
   const seen=new Set();
   return {
    deck:String(deck.deck||(i?'UPPER':'LOWER')).toUpperCase(),cols,rows,
    seats:seats.map(seat=>{
     const row=int(seat.row,-1),col=int(seat.col,-1),w=int(seat.w,1),h=int(seat.h,1);
     const code=String(seat.code||'');
     if(!code||seen.has(code)||row<0||col<0||w<1||h<1||
       row+h>rows||col+w>cols)
      throw new Error('Invalid or duplicate seat coordinates: '+code);
     seen.add(code);
     return {code,row,col,w,h,type:String(seat.type||'seater'),
      state:status(seat)};
    })
   };
  });
 }
 const SWATCH={available:'#fff',male:'#4387ed',female:'#eb479e',unavailable:'#242c3d'};
 const GRADIENT={male:'blueSeat',female:'pinkSeat',unavailable:'darkSeat',available:'whiteSeat'};
 const PALETTE={male:'#276be0',female:'#e04491',unavailable:'#1f2735',available:'#9ca9bd'};
 function defs(){
  return '<defs>'+
   '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#f9fafc"/></linearGradient>'+
   '<linearGradient id="deckBg" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#fbfcff"/><stop offset="1" stop-color="#eef2fa"/></linearGradient>'+
   '<linearGradient id="blueSeat" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#75b3ff"/><stop offset=".53" stop-color="#548ff1"/><stop offset="1" stop-color="#377ceb"/></linearGradient>'+
   '<linearGradient id="pinkSeat" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f688c6"/><stop offset=".53" stop-color="#ec60a8"/><stop offset="1" stop-color="#e64798"/></linearGradient>'+
   '<linearGradient id="darkSeat" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#505c70"/><stop offset="1" stop-color="#263247"/></linearGradient>'+
   '<linearGradient id="whiteSeat" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf0f6"/></linearGradient>'+
   '<radialGradient id="steering" cx=".42" cy=".32" r=".76"><stop stop-color="#4c9bff"/><stop offset=".57" stop-color="#0644a4"/><stop offset="1" stop-color="#041c59"/></radialGradient>'+
   '<filter id="seatShadow" x="-35%" y="-30%" width="170%" height="190%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#234b8c" flood-opacity=".24"/></filter>'+
   '<filter id="wheelShadow" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#092e66" flood-opacity=".38"/></filter>'+
  '</defs>';
 }
 const rect=(x,y,w,h,rx,fill,stroke='',sw=0,extra='')=>
  '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+
  '" fill="'+fill+'"'+(stroke?' stroke="'+stroke+'" stroke-width="'+sw+'"':'')+' '+extra+'/>';
 const text=(x,y,value,size,color,weight=700,more='')=>
  '<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+color+'" font-weight="'+weight+
  '" font-family="Arial, Helvetica, sans-serif" '+more+'>'+esc(value)+'</text>';
 function wheel(cx,cy){
  return '<g filter="url(#wheelShadow)">'+
   '<circle cx="'+cx+'" cy="'+cy+'" r="30" fill="#193d83" stroke="#b7cdec" stroke-width="2"/>'+
   '<circle cx="'+cx+'" cy="'+cy+'" r="26" fill="url(#steering)" stroke="#f3faff" stroke-width="2.5"/>'+
   '<circle cx="'+cx+'" cy="'+cy+'" r="21" fill="none" stroke="#3f88ef" stroke-width="2.8"/>'+
   '<path d="M'+cx+' '+(cy-7)+' L'+cx+' '+(cy-23)+' M'+(cx-7)+' '+(cy+5)+' L'+(cx-21)+' '+(cy+14)+
   ' M'+(cx+7)+' '+(cy+5)+' L'+(cx+21)+' '+(cy+14)+
   '" stroke="#eef8ff" stroke-width="5" stroke-linecap="round"/>'+
   '<circle cx="'+cx+'" cy="'+cy+'" r="8" fill="#e4f4ff" stroke="#3184e9" stroke-width="3"/>'+
  '</g>';
 }
 function exitSymbol(x,y){
  // Compact original vector running-man + red doorway, no emoji or external assets.
  return '<g transform="translate('+x+' '+y+')" fill="none" stroke="#ed2239" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">'+
   '<rect x="33" y="3" width="15" height="35" rx="1"/><circle cx="14" cy="7" r="3.2" fill="#ed2239" stroke="none"/>'+
   '<path d="m14 13-5 11 8 4 7 9M9 23 2 29m14-12 9-8m-5 7 7 1"/>'+
  '</g>';
 }
 function seatShape(seat,x,y,w,h){
  const state=seat.state,isBerth=seat.type==='sleeper'||seat.h>1||seat.w>1;
  const isAvailable=state==='available',isNavy=state==='unavailable';
  const stroke=PALETTE[state],fill='url(#'+GRADIENT[state]+')';
  const shape='<g class="sl49-seat sl49-'+state+'" data-seat="'+esc(seat.code)+'" data-status="'+state+'">'+
   rect(x,y,w,h,8,fill,stroke,2.5,'filter="url(#seatShadow)"')+
   rect(x+4,y+4,w-8,h-8,6,'none',isAvailable?'#c8d1de':'#ffffff85',1.1)+
   (isBerth?
    '<path d="M'+(x+5)+' '+(y+h*.5)+'h'+(w-10)+'" stroke="'+(isAvailable?'#c3cfdd':'#ffffff35')+'" stroke-width="1.5"/>':
    rect(x+w*.27,y+h*.62,w*.46,13,5,isAvailable?'#d9e3f1':'#ffffff25'))+
   (isBerth?
    rect(x+10,y+h-23,w-20,14,5,isAvailable?'#e0e3e9':'#ffffff50',isAvailable?'#9da9b8':'#ffffff80',1.2):
    rect(x+w*.33,y+h-13,w*.34,7,3,isAvailable?'#cfd9e4':'#ffffff3a'))+
   text(x+w/2,y+h*(isBerth?.54:.53)+6,seat.code,bound(w*.34,14,23),
    isAvailable?'#44536b':isNavy?'#f9fbff':'#fff',800,
    'text-anchor="middle" stroke="'+(isAvailable?'none':'#14234640')+'" stroke-width=".5" paint-order="stroke"')+
  '</g>';
  return shape;
 }
 function trimUrl(value){
  const raw=String(value||'').trim();
  if(!raw||raw.length>130)return '';
  try{
   const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
   return /^https?:$/.test(url.protocol)&&url.hostname&&!url.username&&!url.password?
     url.hostname.replace(/^www\./,''):'';
  }catch(_){return ''}
 }
 function buildSvg(payload,helper=root.Coach21V46){
  const decks=resolveGeometry(payload?.decks,helper),width=900;
  const two=decks.length===2;
  const card={x:32,y:126,w:836};
  const panelWidth=two?380:bound(74+decks[0].cols*68,380,530);
  const gap=24,panelPad=24,rowH=66,rowGap=7,colGap=6;
  const maxRows=Math.max(...decks.map(d=>d.rows));
  const gridHeight=maxRows*rowH+Math.max(0,maxRows-1)*rowGap;
  const deckHeight=171+gridHeight+38;
  const top=152,height=Math.round(top+deckHeight+24+117);
  const legendY=top+deckHeight+63;
  const px0=two?(width-(panelWidth*2+gap))/2:(width-panelWidth)/2;
  const route=String(payload.origin||'Origin')+' → '+String(payload.destination||'Destination');
  const subtitle=formatDate(payload.travel_date)+' · '+String(payload.service_number||'Service');
  const titleSize=route.length>37?28:route.length>29?31:35;
  let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" width="'+width+
   '" height="'+height+'" role="img" aria-label="'+esc('Seat layout '+route)+'">'+defs()+
   rect(0,0,width,height,0,'url(#bg)')+
   text(32,48,route,titleSize,'#131d30',800)+
   text(32,88,subtitle,24,'#586575',650)+
   rect(card.x,card.y,card.w,deckHeight+40,20,'#fbfcfe','#d3d8df',3.5);
  decks.forEach((d,index)=>{
   const dx=px0+index*(panelWidth+gap);
   const dy=top;
   const gridWidth=panelWidth-2*panelPad;
   const colWidth=(gridWidth-(d.cols-1)*colGap)/d.cols;
   const gridX=dx+panelPad,gridY=dy+166;
   out+='<g class="sl49-deck" data-deck="'+esc(d.deck)+'">'+
    rect(dx,dy,panelWidth,deckHeight,42,'url(#deckBg)','#94a4ba',3.2)+
    text(dx+30,dy+84,d.deck,20,'#526177',750)+
    '<path d="M'+(dx+23)+' '+(dy+138)+'H'+(dx+panelWidth-23)+
    '" stroke="#c0c9d5" stroke-width="1.8" stroke-dasharray="6 5"/>';
   if(d.deck==='LOWER'||(index===0&&!two))out+=wheel(dx+panelWidth-79,dy+68);
   // The aisle is between the single seat column and paired side on 2+1;
   // on 2+2 the aisle is the center (3rd) column.
   const aisleIndex=d.cols===4?1:d.cols===5?2:Math.floor(d.cols/2);
   const center=gridX+aisleIndex*(colWidth+colGap)+colWidth/2;
   out+='<path d="M'+center+' '+(gridY-20)+'V'+(gridY+gridHeight+7)+
    '" stroke="#cbdcff" stroke-width="2" stroke-dasharray="8 11"/>';
   for(const s of d.seats){
    const x=gridX+s.col*(colWidth+colGap);
    const y=gridY+s.row*(rowH+rowGap);
    const w=colWidth*s.w+(s.w-1)*colGap;
    const h=rowH*s.h+(s.h-1)*rowGap;
    out+=seatShape(s,x,y,w,h);
   }
   // Screenshot's rear escape signage belongs to LOWER. If fixture metadata
   // becomes available, condition it on that; existing seat-map API emits
   // no fixture objects, so LOWER silhouette uses the reference's default.
   if(d.deck==='LOWER'||(index===0&&!two)){
    out+=exitSymbol(dx+panelWidth*.35,dy+deckHeight-78)+
      rect(dx+panelWidth*.31,dy+deckHeight-11,65,11,4,'#e82534');
   }
   out+='</g>';
  });
  const legend=[['Available','available'],['Male','male'],['Female','female'],['Not available','unavailable']];
  let lx=32;
  const legendWidths=[159,112,134,242];
  out+='<g class="sl49-legend">';
  legend.forEach(([label,k],i)=>{
   out+=rect(lx,legendY-17,24,24,0,SWATCH[k],k==='available'?'#101720':SWATCH[k],k==='available'?2.5:0)+
    text(lx+35,legendY+3,label,21,'#445063',650);
   lx+=legendWidths[i];
  });
  out+='</g>';
  const domain=trimUrl(payload.website||payload.operator_website||payload.operator?.website||'');
  const fallback=String(payload.operator_name||payload.operator?.name||'').trim();
  const footer=domain?'Book at '+domain:(fallback?'Book with '+fallback:'Seat availability at time of copy');
  out+=text(32,legendY+53,footer,23,'#245bc8',750);
  out+='</svg>';
  return out;
 }
 function download(blob,filename,env=root){
  const u=env.URL.createObjectURL(blob),link=env.document.createElement('a');
  link.href=u;link.download=filename;link.style.display='none';
  env.document.body.appendChild(link);
  try{link.click()}finally{
   link.remove();
   env.setTimeout(()=>env.URL.revokeObjectURL(u),60000);
  }
 }
 function filename(payload){
  return 'seat-layout-'+String(payload.service_number||'service').replace(/[^a-z0-9_-]/gi,'_').slice(0,40)+
   '-'+String(payload.travel_date||'date').replace(/[^0-9-]/g,'')+'.png';
 }
 async function svgToPng(svg,env=root){
  if(!env.Image||!env.Blob||!env.document?.createElement)
   throw new Error('Image export requires a modern browser');
  const source=new env.Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  const url=env.URL.createObjectURL(source),img=new env.Image();
  try{
   await new Promise((resolve,reject)=>{
    img.onload=resolve;img.onerror=()=>reject(new Error('Unable to render seat-layout image'));
    img.src=url;
   });
  }finally{env.URL.revokeObjectURL(url)}
  const canvas=env.document.createElement('canvas'),scale=2;
  const match=svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if(!match)throw new Error('Image dimensions unavailable');
  canvas.width=Number(match[1])*scale;canvas.height=Number(match[2])*scale;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('PNG canvas is unavailable');
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width/scale,canvas.height/scale);
  ctx.drawImage(img,0,0,canvas.width/scale,canvas.height/scale);
  const png=await new Promise((resolve,reject)=>canvas.toBlob(
   b=>b?resolve(b):reject(new Error('PNG image encoding failed')),'image/png'));
  if(png.type!=='image/png'||!png.size)throw new Error('PNG encoding failed');
  return png;
 }
 async function copy(payload,{refresh,env=root,generate=svgToPng,onFallback}={}){
  if(!payload||!Array.isArray(payload.decks)||!payload.decks.length)
   throw new Error('Seat layout has not loaded');
  if(typeof refresh!=='function')throw new Error('A live seat-layout refresh is required');
  // Promise starts immediately, but navigator.clipboard.write below is also
  // invoked immediately, before asynchronous networking or rasterization.
  const pngPromise=(async()=>{
   const live=await refresh();
   if(!live||!Array.isArray(live.decks)||!live.decks.length)
    throw new Error('Latest seat inventory could not be loaded');
   if(payload.schedule_id!=null&&String(live.schedule_id)!==String(payload.schedule_id))
    throw new Error('The seat layout belongs to another schedule');
   const snapshot={...payload,decks:live.decks};
   const svg=buildSvg(snapshot,env.Coach21V46);
   return generate(svg,env);
  })();
  let item=null;
  if(env.ClipboardItem&&env.navigator?.clipboard?.write){
   try{item=new env.ClipboardItem({'image/png':pngPromise})}
   catch(_){/* Safari/older browsers may reject promise-backed ClipboardItem; download PNG instead. */}
  }
  if(item){
   try{
    await env.navigator.clipboard.write([item]);
    return {copied:true,downloaded:false,filename:filename(payload)};
   }catch(err){
    // If the source refresh/rasterization fails, avoid silently downloading
    // a stale previous layout. The original failure must surface to UI.
    const blob=await pngPromise;
    download(blob,filename(payload),env);
    onFallback?.(err);
    return {copied:false,downloaded:true,filename:filename(payload)};
   }
  }
  const blob=await pngPromise;
  download(blob,filename(payload),env);
  onFallback?.(new Error('Image clipboard unsupported'));
  return {copied:false,downloaded:true,filename:filename(payload)};
 }
 return{buildSvg,resolveGeometry,status,formatDate,svgToPng,copy,filename,trimUrl};
});
