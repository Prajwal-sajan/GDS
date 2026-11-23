/* Screenshot-exact Vehicles > Edit Coach > A/C Seater (2+2).
   Seat IDs are used in real bookings; display_name is a separate editable alias.
   48 numbered positions minus 19,20,23,24 = 44 bookable positions, plus 4 fixtures. */
(function(root,factory){'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.Coach22V47=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const list=v=>Array.isArray(v)?v:[];
 const isTarget=c=>String(c?.pattern||'').replace(/\s/g,'')==='2+2' &&
    /seater/i.test(String(c?.bus_type||c?.name||'')) && !/sleeper/i.test(String(c?.bus_type||c?.name||''));
 function build(){
  const lower={deck:'LOWER',rows:12,cols:5,seats:[],fixtures:[
   {code:'Side Exit',name:'Side Exit',type:'EE_EXIT',row:4,col:4,w:1,h:1,orientation:'—'},
   {code:'Toilet',name:'Toilet',type:'WASH_ROOM',row:5,col:3,w:2,h:1,orientation:'Horizontal'},
   {code:'Roof Exit',name:'Roof Exit',type:'ROOF_EXIT',row:7,col:2,w:1,h:1,orientation:'—'},
   {code:'Back Exit',name:'Back Exit',type:'BACK_EXIT',row:11,col:2,w:1,h:1,orientation:'—'}
  ]};
  // The reference skips ticket IDs 19,20,23,24 because these positions are consumed
  // by the side-exit/toilet zone. Do not renumber remaining seats.
  const skipped=new Set([19,20,23,24]);
  for(let row=0;row<12;row++)for(let slot=0;slot<4;slot++){
   const code=row*4+slot+1;if(skipped.has(code))continue;
   const col=[0,1,3,4][slot];
   lower.seats.push({code:String(code),type:'seater',row,col,w:1,h:1});
  }
  return{decks:[lower],capacity:44,nominal_seater_positions:48};
 }
 const activeCount=layout=>list(layout?.decks).reduce((n,d)=>n+list(d.seats).length,0);
 function layoutCounts(layout){
  const ss=list(layout?.decks).flatMap(d=>list(d.seats));
  const seaters=ss.filter(s=>s.type==='seater').length,sleepers=ss.filter(s=>s.type==='sleeper').length;
  return{seaters,sleepers,capacity:ss.length,nominal_seater_positions:Number(layout?.nominal_seater_positions)||seaters};
 }
 const coord=(row,col,z)=>'R'+(Number(row)+1)+'C'+(Number(col)+1)+'Z'+z;
 const rowPosition=(s,z)=>{let a=[];for(let r=0;r<Math.max(1,Number(s.h)||1);r++)
  for(let c=0;c<Math.max(1,Number(s.w)||1);c++)a.push(coord(Number(s.row)+r,Number(s.col)+c,z));
  return a.join(', ');
 };
 function tableRows(layout,emergencyExits=[]){
  const rows=[],seen=new Set();
  list(layout?.decks).forEach((deck,z)=>{
   list(deck.seats).forEach((s,i)=>rows.push({code:String(s.code),label:String(s.display_name||s.code),
    type:String(s.type||'seater').toUpperCase(),deck:String(deck.deck||'LOWER').toUpperCase(),
    orientation:s.type==='sleeper'?'Vertical':'—',position:rowPosition(s,z),
    ref:z+':'+i,deckIndex:z,seatIndex:i,kind:'seat'}));
  });
  list(layout?.decks).forEach((deck,z)=>list(deck.fixtures).forEach((f,i)=>{
   const name=String(f.code||f.name||f.type||'Fixture');seen.add(name.toLowerCase());
   rows.push({code:name,label:String(f.display_name||name),type:String(f.type||'FIXTURE').toUpperCase(),
    deck:String(deck.deck||'LOWER').toUpperCase(),orientation:f.orientation||'—',position:rowPosition(f,z),
    ref:z+':'+i,deckIndex:z,seatIndex:i,kind:'fixture'});
  }));
  // Do not invent coordinates for legacy descriptive exits which were never mapped.
  list(emergencyExits).forEach(ex=>{
   const name=String(ex||'');if(!name||seen.has(name.toLowerCase()))return;
   rows.push({code:name,label:name,type:/roof/i.test(name)?'ROOF_EXIT':/back/i.test(name)?'BACK_EXIT':'EE_EXIT',
    deck:'LOWER',orientation:'—',position:'Not mapped',ref:'virtual-'+rows.length,
    kind:'virtual-fixture',deckIndex:0,seatIndex:-1});
   seen.add(name.toLowerCase());
  });
  return rows;
 }
 function structuralSignature(layout){
  return JSON.stringify(list(layout?.decks).map(d=>({
   deck:d.deck,cols:d.cols,rows:d.rows,
   seats:list(d.seats).map(s=>[s.code,s.row,s.col,s.w||1,s.h||1,s.type]),
   fixtures:list(d.fixtures).map(f=>[f.code||f.name,f.row,f.col,f.w||1,f.h||1,f.type])
  })));
 }
 function validateLayout(layout){
  const ds=list(layout?.decks);
  if(ds.length!==1||ds[0].deck!=='LOWER')throw Error('2+2 A/C Seater needs one LOWER deck');
  const deck=ds[0];
  if(Number(deck.cols)!==5||!Number.isInteger(Number(deck.rows))||Number(deck.rows)<12||Number(deck.rows)>16)
   throw Error('2+2 coach needs five columns including central aisle and 12–16 rows');
  const occupancy=new Set(),ids=new Set(),aliases=new Set(),fixtures=new Set();
  function region(item,role){
   const {row,col}=item,w=Number(item.w??1),h=Number(item.h??1);
   if(![row,col,w,h].every(x=>Number.isInteger(Number(x)))||Number(row)<0||Number(col)<0||
     Number(row)+h>Number(deck.rows)||Number(col)+w>5||w<1||h<1)
    throw Error(role+' grid position is outside its deck');
   for(let r=Number(row);r<Number(row)+h;r++)for(let c=Number(col);c<Number(col)+w;c++){
    const key=r+':'+c;if(occupancy.has(key))throw Error('Overlapping '+role+' at '+coord(r,c,0));
    occupancy.add(key);
   }
  }
  for(const seat of list(deck.seats)){
   const id=String(seat.code||''),alias=String(seat.display_name||id).trim();
   if(!id||id.length>24||ids.has(id.toUpperCase()))throw Error('Seat IDs must be unique, 1–24 characters');
   if(!alias||alias.length>50||aliases.has(alias.toUpperCase()))throw Error('Display names must be unique, 1–50 characters');
   if(seat.type!=='seater'||Number(seat.w??1)!==1||Number(seat.h??1)!==1||
     ![0,1,3,4].includes(Number(seat.col)))throw Error('2+2 seat '+id+' requires one valid left/right cell');
   ids.add(id.toUpperCase());aliases.add(alias.toUpperCase());region(seat,'seat '+id);
  }
  for(const fixture of list(deck.fixtures)){
   const name=String(fixture.code||fixture.name||'').trim();
   if(!name||fixtures.has(name.toUpperCase()))throw Error('Fixture names must be unique and nonempty');
   fixtures.add(name.toUpperCase());region(fixture,'fixture '+name);
  }
  if(Number(layout.capacity)!==ids.size)throw Error('Total Seats must match bookable passenger seats');
  return true;
 }
 function addSeat(layout,{code='',deck='LOWER',type='seater',row,col}={}){
  const d=layout?.decks?.[0];
  if(!d||String(deck).toUpperCase()!=='LOWER'||type!=='seater')
   throw Error('Only LOWER deck seater positions are supported in 2+2');
  const id=String(code).trim();
  if(!id||id.length>24||list(d.seats).some(s=>String(s.code).toUpperCase()===id.toUpperCase()))
   throw Error('Choose a unique seat ID of up to 24 characters');
  const used=new Set();
  for(const element of [...list(d.seats),...list(d.fixtures)])
   for(let r=Number(element.row);r<Number(element.row)+Number(element.h||1);r++)
    for(let c=Number(element.col);c<Number(element.col)+Number(element.w||1);c++)used.add(r+':'+c);
  const choices=[];
  if(row!==undefined||col!==undefined){
   if(!Number.isInteger(Number(row))||!Number.isInteger(Number(col)))
    throw Error('Specify a valid row and column');
   choices.push([Number(row)-1,Number(col)-1]);
  } else for(let r=0;r<Number(d.rows);r++)for(const c of [0,1,3,4])choices.push([r,c]);
  const location=choices.find(([r,c])=>r>=0&&r<Number(d.rows)&&[0,1,3,4].includes(c)&&!used.has(r+':'+c));
  if(!location)throw Error('No unoccupied seat slot is available');
  const seat={code:id,type:'seater',row:location[0],col:location[1],w:1,h:1};
  d.seats.push(seat);layout.capacity=activeCount(layout);validateLayout(layout);return seat;
 }
 function removeSeat(layout,ref){
  const [z,i]=String(ref).split(':').map(Number);
  if(!Number.isInteger(z)||!Number.isInteger(i)||!layout?.decks?.[z]?.seats?.[i])throw Error('Seat not found');
  const [record]=layout.decks[z].seats.splice(i,1);layout.capacity=activeCount(layout);
  validateLayout(layout);return record;
 }
 const symbol={
  emergency:'<svg viewBox="0 0 38 38" width="33" height="33" fill="none" stroke="#f2232d" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="6" r="3" fill="#f2232d" stroke="none"/><path d="m14 11-5 10 7 4 4 9m-8-13-8 5m13-3 8-10M29 6h7v28h-7z"/></svg>',
  toilet:'<svg viewBox="0 0 62 34" width="55" height="30" fill="#708099" aria-hidden="true"><circle cx="20" cy="5" r="3"/><circle cx="40" cy="5" r="3"/><path d="M16 10h8v13h-3v9h-3v-9h-2zm20 0h8l5 14H31zM37 23h3v9h-3zm5 0h3v9h-3z"/></svg>',
  roof:'<svg viewBox="0 0 32 32" width="27" height="27" fill="none" stroke="#f2232d" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 27V5h20v22M10 9h12v14H10zM16 12v8m-4-4h8"/></svg>'
 };
 const wheel='<svg viewBox="0 0 42 42" width="40" height="40" aria-hidden="true"><circle cx="21" cy="21" r="18" fill="#002a72" stroke="#f2f6ff" stroke-width="2"/><circle cx="21" cy="21" r="14" fill="none" stroke="#81b5ff" stroke-width="2"/><circle cx="21" cy="21" r="5" fill="#f9fdff"/><path d="M21 16 15 7M16 24 7 31M26 24 35 31" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';
 function renderDiagram(layout,{selected=[],disabled=false}={}){
  const deck=layout?.decks?.[0];
  if(!deck)return '<div class="cv47-empty">Generate Layout to create your seating plan.</div>';
  const chosen=new Set(selected.map(String));
  const seats=list(deck.seats).map((s,i)=>{
   const ref='0:'+i;
   const state=chosen.has(ref)?' selected':s.status==='booked_male'?' booked-male':
    s.status==='booked_female'?' booked-female':s.status==='blocked'?' blocked':
    s.status==='no_show'?' no-show':'';
   return '<button type="button" class="cv46-seat cv46-seater cv47-seat'+state+'" '+
    'data-layout-seat="'+ref+'" aria-label="'+E(String(s.display_name||s.code))+' · Seater" '+
    (disabled?'disabled ':'')+'style="grid-row:'+(Number(s.row)+1)+' / span 1;grid-column:'+(Number(s.col)+1)+' / span 1">'+
    '<span class="cv46-cushion"><b data-cv46-label="'+ref+'">'+E(s.display_name||s.code)+'</b><i></i></span></button>';
  }).join('');
  const fixtures=list(deck.fixtures).map((f,i)=>{
   const code=String(f.code||f.name||f.type),type=String(f.type||'').toUpperCase();
   const icon=type==='WASH_ROOM'?symbol.toilet:type==='ROOF_EXIT'?symbol.roof:symbol.emergency;
   const cls=type==='WASH_ROOM'?'cv47-toilet':type==='ROOF_EXIT'?'cv47-roof':'cv47-exit';
   return '<div class="cv47-fixture '+cls+'" data-cv47-fixture="0:'+i+'" title="'+E(f.display_name||code)+
    '" aria-label="'+E(f.display_name||code)+'" style="grid-row:'+(Number(f.row)+1)+'/span '+(Number(f.h)||1)+
    ';grid-column:'+(Number(f.col)+1)+'/span '+(Number(f.w)||1)+'">'+icon+'</div>';
  }).join('');
  return '<div class="cv47-decks"><section class="cv47-deck" aria-label="LOWER deck"><header><b>LOWER</b>'+
   '<span class="cv47-wheel" aria-label="Steering wheel">'+wheel+'</span></header>'+
   '<div class="cv47-grid" style="--cv47-cols:'+Number(deck.cols)+';--cv47-rows:'+Number(deck.rows)+'">'+
   seats+fixtures+'</div><span class="cv47-door" aria-hidden="true"></span></section></div>';
 }
 return{isTarget,build,activeCount,layoutCounts,coord,rowPosition,tableRows,structuralSignature,
  validateLayout,addSeat,removeSeat,renderDiagram};
});