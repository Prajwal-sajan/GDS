/* Vehicles > Edit Coach > A/C Seater/Sleeper (2+1), reference v46.
   Pure geometry and rendering utilities; shared by UI, server validation and tests.
   Seat code remains the immutable booking/inventory ID. display_name is an editable alias. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.Coach21V46=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const seatsOf=d=>Array.isArray(d&&d.seats)?d.seats:[];
 const decksOf=l=>Array.isArray(l&&l.decks)?l.decks:[];
 const isTarget=c=>String(c&&c.pattern||'').replace(/\s/g,'')==='2+1'&&
  /seater[\s/-]*sleeper/i.test(String(c&&c.bus_type||c&&c.name||''));
 const activeCount=l=>decksOf(l).reduce((n,d)=>n+seatsOf(d).length,0);
 const layoutCounts=l=>{
  const all=decksOf(l).flatMap(seatsOf);
  return{seaters:all.filter(s=>s.type==='seater').length,
   sleepers:all.filter(s=>s.type==='sleeper').length,capacity:all.length};
 };
 function build(){
  const lower={deck:'LOWER',rows:12,cols:4,seats:[],fixtures:[
   {name:'Back Exit',code:'Back Exit',type:'BACK_EXIT',row:11,col:1,w:1,h:1}
  ]};
  const upper={deck:'UPPER',rows:12,cols:4,seats:[]};
  // Single sleeper on left; two chairs on right and central gangway (column 2).
  for(let k=0;k<6;k++)lower.seats.push({code:(k+1)+'L',row:2*k,col:0,type:'sleeper',w:1,h:2});
  for(let k=0;k<22;k++)lower.seats.push({code:String(k+1),row:Math.floor(k/2),
   col:2+(k%2),type:'seater',w:1,h:1});
  // Each upper row is 3U|aisle|2U,1U; 6U|aisle|5U,4U and so on.
  for(let k=0;k<6;k++){
   upper.seats.push({code:(3*k+3)+'U',row:2*k,col:0,type:'sleeper',w:1,h:2});
   upper.seats.push({code:(3*k+2)+'U',row:2*k,col:2,type:'sleeper',w:1,h:2});
   upper.seats.push({code:(3*k+1)+'U',row:2*k,col:3,type:'sleeper',w:1,h:2});
  }
  return{decks:[lower,upper],capacity:46};
 }
 function isLegacy(layout){
  const a=decksOf(layout),low=a.find(d=>d.deck==='LOWER'),up=a.find(d=>d.deck==='UPPER');
  if(!low||!up||Number(low.cols)!==4||Number(up.cols)!==4)return false;
  const one=seatsOf(low).find(s=>String(s.code)==='1L');
  const chair=seatsOf(low).find(s=>String(s.code)==='1');
  const firstUpper=seatsOf(up).find(s=>String(s.code)==='1U');
  const thirdUpper=seatsOf(up).find(s=>String(s.code)==='3U');
  return !!(one&&chair&&firstUpper&&thirdUpper&&Number(one.col)===3&&Number(chair.col)===0&&
   Number(firstUpper.col)===0&&Number(thirdUpper.col)===3);
 }
 function projectedSeat(seat,deck,legacy){
  const s={...seat};
  if(legacy){
   if(deck==='LOWER'){
    if(s.type==='sleeper'&&/^\d+L$/i.test(String(s.code)))s.col=0;
    else if(s.type==='seater'&&[0,1].includes(Number(s.col)))s.col=Number(s.col)+2;
   }else if(deck==='UPPER'&&/^\d+U$/i.test(String(s.code))){
    s.col=Number(s.col)===3?0:Number(s.col)===1?2:Number(s.col)===0?3:Number(s.col);
   }
  }
  return s;
 }
 function physicalGeometry(layout){
  const legacy=isLegacy(layout);
  return decksOf(layout).map((d,i)=>({
   ...d,index:i,deck:String(d.deck|| (i?'UPPER':'LOWER')).toUpperCase(),
   seats:seatsOf(d).map(s=>projectedSeat(s,String(d.deck|| (i?'UPPER':'LOWER')).toUpperCase(),legacy))
  }));
 }
 const coord=(row,col,z)=>'R'+(Number(row)+1)+'C'+(Number(col)+1)+'Z'+z;
 function rowPosition(s,z){
  const a=[];
  for(let r=0;r<Math.max(1,Number(s.h)||1);r++)for(let c=0;c<Math.max(1,Number(s.w)||1);c++)
   a.push(coord(Number(s.row)+r,Number(s.col)+c,z));
  return a.join(', ');
 }
 function tableRows(layout,emergencyExits=[]){
  const geometry=physicalGeometry(layout),rows=[];
  for(const d of geometry)for(let i=0;i<d.seats.length;i++){
   const s=d.seats[i],type=String(s.type||'seater').toUpperCase();
   rows.push({code:String(s.code),label:String(s.display_name||s.code),type,deck:d.deck,
    orientation:type==='SLEEPER'?'Vertical':'—',position:rowPosition(s,d.index),
    ref:d.index+':'+i,kind:'seat',deckIndex:d.index,seatIndex:i});
  }
  const already=new Set();
  for(const d of geometry)for(let i=0;i<(d.fixtures||[]).length;i++){
   const f=d.fixtures[i],name=String(f.name||f.code||f.type||'Fixture');
   already.add(name.toLowerCase());
   rows.push({code:name,label:name,type:String(f.type||'FIXTURE').toUpperCase(),deck:d.deck,
    orientation:f.orientation||'—',position:rowPosition(f,d.index),
    ref:d.index+':'+i,kind:'fixture',deckIndex:d.index,seatIndex:i});
  }
  // Legacy templates hold exit descriptors at coach level instead of in layout.decks.
  if((emergencyExits||[]).some(x=>/back\s*exit/i.test(String(x)))&&!already.has('back exit'))
   rows.push({code:'Back Exit',label:'Back Exit',type:'BACK_EXIT',deck:'LOWER',orientation:'—',
    position:'R12C2Z0',ref:'back-exit',kind:'virtual-fixture',deckIndex:0,seatIndex:-1});
  return rows;
 }
 function structuralSignature(layout){
  return JSON.stringify(decksOf(layout).map(d=>({
   deck:d.deck,cols:d.cols,rows:d.rows,
   seats:seatsOf(d).map(s=>[s.code,s.row,s.col,s.w||1,s.h||1,s.type]),
   fixtures:(d.fixtures||[]).map(f=>[f.code||f.name,f.row,f.col,f.w||1,f.h||1,f.type])
  })));
 }
 function validateLayout(layout){
  const ds=decksOf(layout);
  if(ds.length!==2||ds[0].deck!=='LOWER'||ds[1].deck!=='UPPER')
   throw Error('A 2+1 Seater/Sleeper needs LOWER and UPPER decks');
  let keys=new Set(),labels=new Set(),taken=[];
  for(let d=0;d<2;d++){
   const deck=ds[d];
   if(Number(deck.cols)!==4||Number(deck.rows)<12||Number(deck.rows)>16)
    throw Error('2+1 decks require four columns and 12–16 rows');
   taken[d]=new Set();
   for(const seat of seatsOf(deck)){
    const code=String(seat.code||''),label=String(seat.display_name||code).trim();
    if(!code||code.length>24||keys.has(code.toUpperCase()))throw Error('Seat IDs must be unique and nonempty');
    keys.add(code.toUpperCase());
    if(!label||label.length>50||labels.has(label.toUpperCase()))throw Error('Display names must be unique and 1–50 characters');
    labels.add(label.toUpperCase());
    if(!['seater','sleeper'].includes(seat.type))throw Error('Unsupported seat type');
    const vals=[seat.row,seat.col,seat.w??1,seat.h??1].map(Number);
    if(vals.some(v=>!Number.isInteger(v))||vals[0]<0||vals[1]<0||vals[2]<1||vals[3]<1||
     vals[0]+vals[3]>Number(deck.rows)||vals[1]+vals[2]>4)
     throw Error('Seat '+code+' is outside its deck grid');
    if(seat.type==='sleeper'&&(vals[3]!==2||vals[2]!==1))
     throw Error('Sleeper '+code+' must be vertical across two rows');
    if(seat.type==='seater'&&(vals[3]!==1||vals[2]!==1))
     throw Error('Seater '+code+' must occupy one grid cell');
    for(let x=vals[0];x<vals[0]+vals[3];x++)for(let y=vals[1];y<vals[1]+vals[2];y++){
     const cell=x+':'+y;
     if(taken[d].has(cell))throw Error('Overlapping seats on '+deck.deck+' at '+coord(x,y,d));
     taken[d].add(cell);
    }
   }
   for(const f of deck.fixtures||[]){
    const pos=[f.row,f.col].map(Number);
    if(pos.some(v=>!Number.isInteger(v))||pos[0]<0||pos[0]>=Number(deck.rows)||pos[1]<0||pos[1]>=4)
     throw Error('Fixture is outside deck bounds');
    if(taken[d].has(pos[0]+':'+pos[1]))throw Error('Fixture overlaps a passenger seat');
   }
  }
  if(keys.size!==Number(layout.capacity))throw Error('Coach capacity must equal passenger seat count');
  return true;
 }
 function addSeat(layout,{deck='LOWER',type='seater',code='',row,col}={}){
  const ds=decksOf(layout);
  const index=String(deck).toUpperCase()==='UPPER'?1:0,d=ds[index];
  if(!d)throw Error('Choose a deck');
  if(!['seater','sleeper'].includes(type))throw Error('Choose Seater or Sleeper');
  const next=String(code||'').trim();
  if(!next||next.length>24||ds.some(x=>seatsOf(x).some(s=>String(s.code).toUpperCase()===next.toUpperCase())))
   throw Error('Enter a unique seat ID of up to 24 characters');
  const used=new Set();
  for(const s of seatsOf(d))for(let r=Number(s.row);r<Number(s.row)+Number(s.h||1);r++)
   for(let c=Number(s.col);c<Number(s.col)+Number(s.w||1);c++)used.add(r+':'+c);
  for(const f of d.fixtures||[])used.add(Number(f.row)+':'+Number(f.col));
  const columns=index===0?(type==='sleeper'?[0]:[2,3]):[0,2,3],h=type==='sleeper'?2:1;
  let proposed=[];
  if(row!==undefined||col!==undefined){
   if(!Number.isInteger(Number(row))||!Number.isInteger(Number(col)))throw Error('Enter valid row and column');
   proposed=[[Number(row)-1,Number(col)-1]];
  }else for(let r=0;r<=Number(d.rows)-h;r+=h)for(const c of columns)proposed.push([r,c]);
  const free=proposed.find(([r,c])=>r>=0&&c>=0&&r+h<=Number(d.rows)&&c<4&&columns.includes(c)&&
   Array.from({length:h},(_,i)=>r+i+':'+c).every(k=>!used.has(k)));
  if(!free)throw Error('No free '+type+' slot at that position; remove an unused seat first');
  const record={code:next,row:free[0],col:free[1],type,w:1,h};
  d.seats.push(record);layout.capacity=activeCount(layout);
  validateLayout(layout);return record;
 }
 function removeSeat(layout,ref){
  const [deck,index]=String(ref).split(':').map(Number);
  if(!Number.isInteger(deck)||!Number.isInteger(index)||!decksOf(layout)[deck]?.seats?.[index])
   throw Error('Seat is not present');
  const [removed]=layout.decks[deck].seats.splice(index,1);
  layout.capacity=activeCount(layout);validateLayout(layout);return removed;
 }
 function renderDiagram(layout,{selected=[],disabled=false,emergencyExits=[]}={}){
  const selectedSet=new Set(selected.map(String)),geo=physicalGeometry(layout);
  const hasBackExit=geo.some(d=>(d.fixtures||[]).some(f=>/back\s*exit/i.test(String(f.name||f.code||''))))||
    emergencyExits.some(x=>/back\s*exit/i.test(String(x)));
  if(!geo.length)return '<div class="cv46-empty">Generate Layout to create your seats.</div>';
  const wheel='<svg viewBox="0 0 42 42" width="40" height="40" aria-hidden="true"><circle cx="21" cy="21" r="18" fill="#002a72" stroke="#eff6ff" stroke-width="2"/><circle cx="21" cy="21" r="14" fill="none" stroke="#81b5ff" stroke-width="2"/><circle cx="21" cy="21" r="5" fill="#f9fdff"/><path d="M21 16 15 7M16 24 7 31M26 24 35 31" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';
  const exit='<svg viewBox="0 0 38 36" width="34" height="34" fill="none" stroke="#f1242a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="6" r="3" fill="#f1242a" stroke="none"/><path d="m15 11-4 8 7 5 3 8M11 19l-7 5M18 23l8-9M28 8h8v26h-8z"/></svg>';
  return '<div class="cv46-decks">'+geo.map((d,z)=>{
   const cells=d.seats.map((s,i)=>{
    const sleeper=s.type==='sleeper',ref=z+':'+i,cls=sleeper?'cv46-sleeper':'cv46-seater';
    const status=selectedSet.has(ref)?' selected':(s.status==='booked_male'?' booked-male':s.status==='booked_female'?' booked-female':s.status==='blocked'?' blocked':s.status==='no_show'?' no-show':'');
    const style='grid-row:'+(Number(s.row)+1)+'/span '+(Number(s.h)||1)+';grid-column:'+(Number(s.col)+1)+'/span '+(Number(s.w)||1);
    return '<button type="button" data-layout-seat="'+ref+'" class="cv46-seat '+cls+status+'" style="'+style+
     '" title="'+esc(s.code)+' · '+esc(s.type)+'" aria-label="'+esc(String(s.display_name||s.code))+
     ' · '+esc(s.type)+(disabled?'':' · select')+'"'+(disabled?' disabled':'')+'><span class="cv46-cushion"><b data-cv46-label="'+ref+'">'+esc(s.display_name||s.code)+'</b><i></i></span></button>';
   }).join('');
   return '<section class="cv46-deck cv46-'+d.deck.toLowerCase()+'" aria-label="'+esc(d.deck)+' deck">'+
    '<header><b>'+esc(d.deck)+'</b>'+(z===0?'<span class="cv46-wheel" aria-label="Steering wheel">'+wheel+'</span>':'')+'</header>'+
    '<div class="cv46-grid" style="--cv46-cols:'+Number(d.cols)+';--cv46-rows:'+Number(d.rows)+'">'+cells+'</div>'+
    (z===0&&hasBackExit?'<span class="cv46-emergency" aria-label="Emergency exit">'+exit+'</span><span class="cv46-door" aria-label="Back door"></span>':'')+
    '</section>';
  }).join('')+'</div>';
 }
 return{isTarget,build,isLegacy,physicalGeometry,layoutCounts,tableRows,coord,rowPosition,
  structuralSignature,validateLayout,addSeat,removeSeat,renderDiagram,activeCount};
});
