'use strict';
/* v40 vector landscape PDF: two reference-backed chart variants, one engine for
 * Print, Download, and Share; never include unselected passenger fields. */
const {Pdf}=require('./report-suite-pdf-v21');
const C=require('./pickup-chart-v40');
const PAGE={W:841.89,H:595.28},M=14,R=827.89;
const BLUE=[.090,.354,.980],TXT=[.12,.16,.23],GRAY=[.40,.43,.50],
 GRID=[.82,.84,.88],WHITE=[1,1,1],STRIPE=[.977,.980,.988];
const MAX_Y=PAGE.H-13;
const bodyFont=n=>n>=13?6.4:n>=11?6.8:n>=9?7.15:7.6;
function textWidth(str,size){
 return [...String(str??'')].reduce((n,c)=>n+size*('il!.,;:|() '.includes(c)?.29:'MW@%'.includes(c)?.86:
  /[0-9]/.test(c)?.55:/[A-Z]/.test(c)?.60:.50),0);
}
function wrap(s,max,font){
 s=C.safe(s).replace(/₹/g,'Rs.');
 if(!s)return [''];
 const out=[],tokens=s.split(/\s+/);let line='';
 for(let token of tokens){
  if(!token)continue;
  while(textWidth(token,font)>max){
   if(line){out.push(line);line='';}
   let n=1;while(n<token.length&&textWidth(token.slice(0,n+1),font)<=max)n++;
   out.push(token.slice(0,n));token=token.slice(n);
  }
  if(!token)continue;
  const test=line?line+' '+token:token;
  if(line&&textWidth(test,font)>max){out.push(line);line=token}else line=test;
 }
 if(line)out.push(line);
 return out.length?out:[''];
}
function linesValue(row,k){
 const value=row[k];
 if(k==='fare')return value==null||value===''?'':'Rs.'+Math.round(Number(value)||0);
 if(k==='gender')return String(value||'').toUpperCase().startsWith('F')?'F':String(value||'').toUpperCase().startsWith('M')?'M':C.safe(value);
 return C.safe(value);
}
function colSpecs(opts){
 return [{key:'#',label:'#',weight:.24},...opts.columns.map(k=>{
  const [,,weight]=C.BY_KEY[k];return {key:k,label:C.BY_KEY[k][1],weight};
 })];
}
function draw(pdf,rowText,y,sz,bold=false,color=TXT){
 pdf.page.text(rowText.x,y,rowText.text,{size:sz,bold,color,align:rowText.align||'left'});
}
function cells(pdf,cols,rows,{blue=true,compact=false}={}){
 const w=PAGE.W-M*2,unit=w/cols.reduce((s,c)=>s+c.weight,0);
 const width=cols.map(c=>unit*c.weight);
 const fs=bodyFont(cols.length),lineH=fs+2;
 const titleH=compact?18:19;
 const header=()=>{
  if(pdf.y+titleH+17>MAX_Y)pdf.newPage();
  pdf.page.rect(M,pdf.y,w,titleH,blue?BLUE:[.91,.94,.98]);
  let x=M;
  for(let i=0;i<cols.length;i++){
   pdf.page.text(x+2,pdf.y+3,cols[i].label,{size:fs+.1,bold:true,color:blue?WHITE:TXT});
   x+=width[i];
  }
  pdf.y+=titleH;
 };
 header();
 rows.forEach((row,idx)=>{
  const wraps=cols.map((col,i)=>wrap(col.key==='#'?String(row._number):linesValue(row,col.key),width[i]-5,fs));
  const height=Math.max(17,Math.min(50,Math.max(...wraps.map(x=>x.length))*lineH+4));
  if(pdf.y+height>MAX_Y){pdf.newPage();header();}
  if(idx%2===0)pdf.page.rect(M,pdf.y,w,height,STRIPE);
  let x=M;
  for(let i=0;i<cols.length;i++){
   const maxLines=Math.max(1,Math.floor((height-4)/lineH));
   wraps[i].slice(0,maxLines).forEach((line,k)=>pdf.page.text(x+2,pdf.y+2+k*lineH,line,{size:fs,color:GRAY,
      bold:cols[i].key==='seat'}));
   pdf.page.rule(x,pdf.y,x,pdf.y+height,GRID,.24);
   x+=width[i];
  }
  pdf.page.rule(M+w,pdf.y,M+w,pdf.y+height,GRID,.24);
  pdf.page.rule(M,pdf.y+height,M+w,pdf.y+height,GRID,.31);
  pdf.y+=height;
 });
}
function groupTitle(pdf,value,opts,rows){
 if(pdf.y+48>MAX_Y)pdf.newPage();
 pdf.page.rule(M,pdf.y,R,pdf.y,BLUE,1.15);
 pdf.page.text(M,pdf.y+4,value,{size:9.5,bold:true,color:TXT});
 pdf.y+=20;
}
function header(pdf,report,opts,asOf){
 const p=pdf.page;
 p.text(PAGE.W/2,10,'Pickup Chart - '+report.service,{size:14,bold:true,align:'center',color:TXT});
 p.text(M,31,report.operator,{size:10,bold:true,color:TXT});
 const fields=[
  ['Service:',report.service],['Route:',report.origin+' -> '+report.destination],['Date:',report.date]
 ];
 if(opts.chart==='rto'){
  const start=report.stages.find(s=>s.type==='pickup');
  const end=report.stages.filter(s=>s.type==='drop').slice(-1)[0];
  fields.push(['Pickup:',start?.name||report.origin]);
 }
 fields.forEach(([label,value],i)=>{
  p.text(M,47+i*13,label,{size:8.4,bold:true,color:TXT});
  p.text(M+42,47+i*13,value,{size:8.4,color:GRAY});
 });
 const right=[
  ...(opts.chart==='rto'?[['Drop:',report.stages.filter(s=>s.type==='drop').slice(-1)[0]?.name||report.destination]]:[]),
  ['Vehicle:',report.vehicle_number||'Not assigned'],
  ['Driver:',[report.driver,report.driver_phone].filter(Boolean).join(' - ')||'Not assigned'],
  ...(opts.chart==='rto'?[['Printed:',C.formatPrinted(asOf)]]:[])
 ];
 right.forEach(([label,value],i)=>{
  p.text(600,47+i*13,label,{size:8.3,bold:true,color:TXT});
  p.text(646,47+i*13,value,{size:8.3,color:GRAY});
 });
 pdf.y=opts.chart==='rto'?122:115;
 p.rule(M,pdf.y,R,pdf.y,BLUE,1.5);
 pdf.y+=8;
}
const stageSort=(a,b)=>Number(a.boarding_order||0)-Number(b.boarding_order||0)||
 C.natural(a.pickup_time,b.pickup_time)||C.natural(a.pickup,b.pickup);
function stopName(p,kind){
 const name=kind==='pickup'?p.pickup:p.drop;
 const h=kind==='pickup'?p.pickup_time:p.drop_time;
 const day=kind==='pickup'?p.pickup_day:p.drop_day;
 return C.safe(name)+' - '+C.humanTime(h)+(day>1?' Day '+day:'');
}
function stopGroups(rows,kind){
 const m=new Map();
 for(const row of rows){
  const id=kind==='pickup'?row.boarding_id:row.dropping_id;
  const key=String(id||'')+'|'+String(kind==='pickup'?row.pickup:row.drop);
  if(!m.has(key))m.set(key,[]);
  m.get(key).push(row);
 }
 const groups=[...m.values()];
 groups.sort((a,b)=>{
  const x=a[0],y=b[0],kx=kind==='pickup'?'boarding_order':'dropping_order';
  return Number(x[kx]??0)-Number(y[kx]??0)||
   C.natural(kind==='pickup'?x.pickup_time:x.drop_time,kind==='pickup'?y.pickup_time:y.drop_time);
 });
 return groups;
}
function titleGroup(p,group){
 const title=C.safe(p.pickup)+' Day '+(p.pickup_day||1)+' - '+C.humanTime(p.pickup_time)+
  ' ('+group.length+' seat'+(group.length===1?'':'s')+')';
 return title+(p.exchange_point?' | Bus Pickup: '+p.exchange_point+
  (p.exchange_time?' '+C.humanTime(p.exchange_time):''):'');
}
function summary(pdf,title,report,rows,kind){
 if(pdf.y+65>MAX_Y)pdf.newPage();
 pdf.page.text(M,pdf.y,title,{size:10,bold:true,color:TXT});pdf.y+=15;
 const col=[{key:'station',label:'Station',weight:.62},
  {key:'point',label:'Station Point',weight:4.7},
  {key:'count',label:kind==='pickup'?'Seats':'Seat Count',weight:.55},
  {key:'names',label:'Seat Name',weight:1.9}];
 const list=stopGroups(rows,kind).map((g,i)=>{
  const first=g[0];let point=stopName(first,kind);
  if(kind==='pickup'&&first.exchange_point)point+=' (Bus Pickup: '+first.exchange_point+
    (first.exchange_time?' '+C.humanTime(first.exchange_time):'')+')';
  return {station:i===0?(kind==='pickup'?first.from_city:first.to_city):'',
   point,count:g.length,names:g.map(x=>x.seat).sort(C.natural).join(', ')};
 });
 cells(pdf,col,list,{compact:true});pdf.y+=7;
}
function generate(report,opts,clock=new Date()){
 const pdf=new Pdf(PAGE);
 const source=C.rowsFor(report,opts);
 header(pdf,report,opts,clock);
 if(opts.chart==='rto'){
  const rows=source.sort((a,b)=>C.natural(a.seat,b.seat)||C.natural(a.pnr,b.pnr))
   .map((p,i)=>({...p,_number:i+1}));
  cells(pdf,colSpecs(opts),rows);
 }else{
  let count=0;
  const groups=stopGroups(source,'pickup');
  for(const group of groups){
   const first=group[0];
   groupTitle(pdf,titleGroup(first,group));
   // Preserve boarding-chart manifest order from the source PDF. Only the RTO
   // layout is intentionally sorted by seat; the grouped chart is not.
   const rows=group.map(p=>({...p,_number:++count}));
   cells(pdf,colSpecs(opts),rows);
   pdf.y+=4;
  }
  summary(pdf,'Boarding Details',report,source,'pickup');
  summary(pdf,'Dropping Details',report,source,'drop');
 }
 return pdf.file();
}
module.exports={generate,wrap,colSpecs,stopGroups,titleGroup};
