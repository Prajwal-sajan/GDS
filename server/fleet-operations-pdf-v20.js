'use strict';
// Dependency-free, vector A4-landscape PDF matching the uploaded Fleet Operations report.
// All figures come from the same filtered dataset as the on-screen report.
const W=841.89,H=595.28,M=24,RIGHT=W-M,WIDTH=W-2*M;
const C={ink:[.10,.15,.25],muted:[.32,.38,.48],blue:[.105,.35,.97],
  grid:[.79,.82,.86],alternate:[.975,.979,.984],footer:[.89,.91,.94],white:[1,1,1]};
const escPDF=s=>String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
  .replace(/[\u0000-\u001f]/g,' ');
const ascii=s=>String(s??'').replace(/[₹]/g,'Rs. ').replace(/[→]/g,'->').replace(/[–—]/g,'-')
  .replace(/[×]/g,'x').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[•]/g,'-')
  .replace(/[^\x20-\x7e\xA0-\xFF]/g,'?');
const india=v=>Math.round(Number(v)||0).toLocaleString('en-IN');
const decimal=(v,n=1)=>Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:n});
const money=v=>'Rs. '+india(v);
const pct=v=>v===null||v===undefined?'—'.replace('—','-'):Number(v).toFixed(1).replace(/\.0$/,'')+'%';
const ratio=v=>v===null||v===undefined?'-':Number(v).toFixed(2);
const delta=v=>v===null||v===undefined?'-':(v>=0?'+':'')+Number(v).toFixed(1)+'%';
const fmt=(v,kind,col)=>{
 if(v===null||v===undefined||v==='')return '-';
 if(kind==='money')return money(v);
 if(kind==='pct')return pct(v);
 if(kind==='delta')return delta(v);
 if(kind==='ratio')return ratio(v);
 if(kind==='decimal')return decimal(v,1);
 if(kind==='number')return india(v);
 if(kind==='text')return String(v);
 return String(v);
};
const width=(s,size)=>[...String(s)].reduce((n,c)=>n+size*(
  'ijl.,:;|!'.includes(c)?.24:'MW@%'.includes(c)?.85:'1234567890'.includes(c)?.55:
  'ft() '.includes(c)?.35:'ABCDEFGHJKLMNOPQRSTUVWXYZ'.includes(c)?.63:.49),0);
function wrap(text,max,size){
 const words=ascii(text).split(/\s+/),lines=[],put=l=>{if(l)lines.push(l)};
 let line='';
 for(let word of words){
   if(!word)continue;
   while(width(word,size)>max){
     const pieces=[...word];let segment='';
     while(pieces.length&&width(segment+pieces[0],size)<=max)segment+=pieces.shift();
     if(!segment)segment=pieces.shift();
     if(line){put(line);line='';}
     put(segment);word=pieces.join('');
   }
   if(!word)continue;
   if(line&&width(line+' '+word,size)>max){put(line);line=word;}
   else line=line?line+' '+word:word;
 }
 put(line);return lines.length?lines:[''];
}
const rgb=c=>c.map(v=>Number(v).toFixed(3)).join(' ');
class Page{
 constructor(){this.ops=[];}
 rect(x,y,w,h,color){this.ops.push(`${rgb(color)} rg ${x.toFixed(2)} ${(H-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);}
 line(x1,y1,x2,y2,color=C.grid,lw=.45){this.ops.push(`${rgb(color)} RG ${lw} w ${x1.toFixed(2)} ${(H-y1).toFixed(2)} m ${x2.toFixed(2)} ${(H-y2).toFixed(2)} l S`);}
 text(x,y,str,{size=8,bold=false,color=C.ink,align='left'}={}){
   const str0=ascii(str),ww=width(str0,size);if(align==='right')x-=ww;if(align==='center')x-=ww/2;
   this.ops.push(`BT /${bold?'F2':'F1'} ${size.toFixed(2)} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(H-y-size).toFixed(2)} Tm (${escPDF(str0)}) Tj ET`);
 }
 textLines(x,y,lines,{size=7.8,lead=9.6,bold=false,color=C.ink,align='left'}={}){
   lines.forEach((line,i)=>this.text(x,y+i*lead,line,{size,bold,color,align}));
 }
}
class Builder{
 constructor(){this.pages=[new Page()];this.y=13;}
 page(){return this.pages[this.pages.length-1];}
 newPage(){this.pages.push(new Page());this.y=19;}
 need(space){if(this.y+space>H-20)this.newPage();}
 title(title){this.need(24);this.page().text(W/2,this.y,title,{size:13,bold:true,align:'center'});this.y+=20;}
 intro(r){
   this.title('Fleet Operations');
   const left=[['',r.operator_name],['Period:',r.from+' to '+r.to],
    ['Generated:',new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})],
    ['Fleet util:',pct(r.summary.fleet_util_pct)],['Trips:',r.summary.trips],['Buses:',r.summary.buses],
    ['Drivers:',r.summary.drivers],['Km (GPS):',india(r.summary.km)]];
   const right=[['Fuel (L):',india(r.summary.fuel_l)],['Mileage:',ratio(r.summary.kmpl)+' km/L'],
    ['Diesel:',money(r.summary.diesel)],['Idle bus-days:',r.summary.idle_bus_days],
    ['Trips without bus:',r.summary.trips_without_bus],['Trips turned off:',r.summary.trips_turned_off],
    ['Trips without driver:',r.summary.trips_without_driver]];
   const y0=this.y;
   left.forEach(([label,val],i)=>{
     if(!label)this.page().text(M,y0+i*12,ascii(val),{size:10,bold:true});
     else{this.page().text(M,y0+i*12,label,{size:8.5,bold:true});this.page().text(M+66,y0+i*12,ascii(val),{size:8.5});}
   });
   right.forEach(([label,val],i)=>{
     const x=680;
     this.page().text(x,y0+12+i*12,label,{size:8.4,bold:true});
     this.page().text(RIGHT-3,y0+12+i*12,ascii(val),{size:8.4,align:'right'});
   });
   this.y=y0+112;
 }
 section(name,cols,rows,total){
   const widths=cols.map(c=>c.w),full=widths.reduce((a,b)=>a+b,0);
   if(Math.abs(full-WIDTH)>2)throw new Error('PDF columns do not fit '+name+' '+full);
   this.need(30);
   let active=this.page();
   active.line(M,this.y,RIGHT,this.y,C.blue,1.4);
   active.text(M,this.y+3,name,{size:9.2,bold:true});
   this.y+=17;
   const header=()=>{this.need(18);this.page().rect(M,this.y,WIDTH,14.8,C.blue);
     let x=M;cols.forEach(c=>{this.page().text(x+2.6,this.y+2.7,c.label,{size:7.2,bold:true,color:C.white});
       x+=c.w;});this.y+=14.8;};
   header();
   rows.forEach((row,i)=>{
     const cells=cols.map(c=>{
       let raw=c.key==='drivers'&&Array.isArray(row.drivers)?row.drivers.map(d=>d.name+(d.phone?' ('+d.phone+')':'')).join(', '):
         c.key==='crew'&&Array.isArray(row.crew)?row.crew.map(d=>(d.role||'Crew')+': '+d.name+(d.phone?' ('+d.phone+')':'')).join(', '):row[c.key];
       const s=fmt(raw,c.kind,c);
       return wrap(s,c.w-5.5,7.4);
     });
     const n=Math.max(1,...cells.map(x=>x.length)),height=Math.max(13.3,n*9.15+4.2);
     if(this.y+height>H-20){this.newPage();header();}
     if(i%2===0)this.page().rect(M,this.y,WIDTH,height,C.alternate);
     let x=M;
     cols.forEach((c,j)=>{
       const cell=cells[j],numeric=['number','decimal','pct','ratio','delta','money'].includes(c.kind);
       this.page().textLines(numeric?x+c.w-3.8:x+2.5,this.y+2.3,cell,
         {size:7.4,lead:9.15,align:numeric?'right':'left',color:C.muted});
       this.page().line(x,this.y,x,this.y+height,C.grid,.30);
       x+=c.w;
     });
     this.page().line(RIGHT,this.y,RIGHT,this.y+height,C.grid,.30);
     this.page().line(M,this.y+height,RIGHT,this.y+height,C.grid,.35);
     this.y+=height;
   });
   if(total){
     const cells=cols.map(c=>wrap(fmt(total[c.key],c.kind,c),c.w-6,7.4));
     const h=Math.max(14,...cells.map(lines=>lines.length*9.3+3));
     if(this.y+h>H-20){this.newPage();header();}
     this.page().rect(M,this.y,WIDTH,h,C.footer);
     let x=M;
     cols.forEach((c,j)=>{
       const numeric=['number','decimal','pct','ratio','delta','money'].includes(c.kind);
       this.page().textLines(numeric?x+c.w-3.5:x+2.5,this.y+2.8,cells[j],
         {size:7.4,lead:9.2,bold:true,align:numeric?'right':'left'});
       this.page().line(x,this.y,x,this.y+h,C.grid,.35);
       x+=c.w;
     });
     this.page().line(RIGHT,this.y,RIGHT,this.y+h,C.grid,.35);
     this.page().line(M,this.y+h,RIGHT,this.y+h,C.grid,.4);
     this.y+=h;
   }
   this.y+=6;
 }
 render(){
   // Builtin Type1 Helvetica gives portable/searchable vector text. No external font dependency.
   const objects=[
     '<< /Type /Catalog /Pages 2 0 R >>','', // 1 Catalog, 2 Pages
     '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
     '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
   ];
   const kids=[];
   for(const page of this.pages){
     const stream=page.ops.join('\n')+'\n';
     const data=Buffer.from(stream,'latin1');
     const contentId=objects.length+1;
     objects.push(`<< /Length ${data.length} >>\nstream\n${stream}endstream`);
     const pageId=objects.length+1;
     objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
     kids.push(pageId+' 0 R');
   }
   objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${this.pages.length} >>`;
   let file='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n',offsets=[0];
   for(let i=0;i<objects.length;i++){
     offsets.push(Buffer.byteLength(file,'latin1'));
     file+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
   }
   const xref=Buffer.byteLength(file,'latin1');
   file+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
   for(let i=1;i<offsets.length;i++)file+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
   file+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
   return Buffer.from(file,'latin1');
 }
}
const cols=(labels,widths,kinds)=>labels.map(([key,label],i)=>({key,label,w:widths[i],kind:kinds[i]||'text'}));
function generate(report){
 const pdf=new Builder();pdf.intro(report);
 pdf.section('By bus',cols([
   ['vehicle','Bus'],['trips','Trips'],['days_ran','Days ran'],['days_idle','Days idle'],['util_pct','Util'],
   ['km','Km (GPS)'],['km_route','Km (route)'],['fuel_l','Fuel (L)'],['kmpl','km/L'],
   ['diesel','Diesel'],['rs_per_km','Rs. /km'],['drivers','Drivers']],
   [77,34,49,48,38,57,57,49,35,72,46,232],
   ['text','number','number','number','pct','number','number','decimal','ratio','money','ratio','text']),
   report.by_bus,report.totals.by_bus);
 pdf.section('By driver',cols([
   ['driver','Driver'],['phone','Phone'],['trips','Trips'],['days','Days'],['km','Km (GPS)'],
   ['fuel_l','Fuel (L)'],['kmpl','km/L'],['vs_bus_avg_pct','vs bus avg'],['buses','Buses']],
   [150,88,42,41,78,76,55,85,179],
   ['text','text','number','number','number','decimal','ratio','delta','text']),
   report.by_driver,report.totals.by_driver);
 pdf.section('Driver x bus',cols([
   ['driver','Driver'],['vehicle','Bus'],['trips','Trips'],['km','Km (GPS)'],
   ['fuel_l','Fuel (L)'],['kmpl','km/L'],['bus_avg_kmpl','Bus avg km/L'],['vs_bus_avg_pct','vs bus avg']],
   [126,122,46,87,70,55,66,222],
   ['text','text','number','number','decimal','ratio','ratio','delta']),
   report.driver_by_bus,report.totals.driver_by_bus);
 pdf.section('Daily',cols([
   ['date','Date'],['fleet','Fleet'],['used','Used'],['trips','Trips'],['util_pct','Util'],['no_bus','No bus'],
   ['turned_off','Off'],['km','Km (GPS)'],['fuel_l','Fuel (L)'],['kmpl','km/L'],
   ['diesel','Diesel'],['idle_buses','Idle buses']],
   [71,38,39,42,42,44,39,46,66,55,73,239],
   ['text','number','number','number','pct','number','number','number','decimal','ratio','money','text']),
   report.daily,report.totals.daily);
 pdf.section('Trip-wise',cols([
   ['date','Date'],['departure_time','Dep'],['service','Service'],['route','Route'],['vehicle','Bus'],
   ['drivers','Driver(s)'],['crew','Crew'],['km','Km (GPS)'],['fuel_l','Fuel (L)'],
   ['kmpl','km/L'],['diesel','Diesel']],
   [66,33,49,98,59,187,118,55,41,38,50],
   ['text','text','text','text','text','text','text','number','decimal','ratio','money']),
   report.rows,report.totals.rows);
 return pdf.render();
}
module.exports={generate};
