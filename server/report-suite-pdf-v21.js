'use strict';
const Specs=require('../public/js/report-suite-specs-v21');
const DEF=Specs.DEF;
const landscape={W:841.89,H:595.28},portrait={W:595.28,H:841.89};
const ink=[.09,.15,.25],slate=[.34,.39,.49],grid=[.82,.85,.89],
 blue=[.09,.34,.96],shade=[.965,.975,.99],totalColor=[.90,.92,.95],white=[1,1,1];
const rgb=c=>c.map(n=>Number(n).toFixed(3)).join(' ');
const sanitize=s=>String(s??'').replace(/₹/g,'Rs. ').replace(/→/g,'->').replace(/[—–]/g,'-')
 .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\u2022/g,'-')
 .replace(/[^\x20-\x7e\xA0-\xFF]/g,'?').replace(/[\r\n\t]/g,' ');
const escape=s=>sanitize(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const textW=(s,size)=>[...sanitize(s)].reduce((a,c)=>a+size*('il!.,;:|() '.includes(c)?.32:'MW@%'.includes(c)?.82:/[0-9]/.test(c)?.54:/[A-Z]/.test(c)?.62:.49),0);
const money=n=>'Rs. '+Math.round(Number(n)||0).toLocaleString('en-IN');
const number=n=>Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:1});
const fmt=(row,c)=>{
 const v=row?.[c.key];
 if(v===null||v===undefined||v==='')return '-';
 if(c.type==='money')return money(v);
 if(c.type==='number')return number(v);
 if(c.type==='ratio')return Number(v).toFixed(2);
 if(c.type==='pct')return Number(v).toFixed(1).replace(/\.0$/,'')+'%';
 if(c.type==='delta')return (v>0?'+':'')+Number(v).toFixed(1)+'%';
 if(c.type==='minutes')return Number(v).toFixed(0)+'m';
 if(c.type==='duration'){const minutes=Math.round(Number(v));return minutes>=60?Math.floor(minutes/60)+'h '+minutes%60+'m':minutes+'m';}
 if(c.type==='speed')return number(v)+' km/h';
 return String(v);
};
const labelValue=(d,metric)=>{
 const [label,key,type]=metric;let value=d.summary?.[key];
 if(type==='recorded')value=String(d.summary?.trips_recorded??0)+'/'+String(d.summary?.trips??0);
 else if(type==='resale'||type==='no_show_resale')value=String(value??0)+' ('+Number(d.summary?.resale_pct||0).toFixed(1)+'%)';
 else if(type==='mileage')value=value===null||value===undefined?'-':Number(value).toFixed(2)+' km/L';
 else value=fmt({[key]:value},{key,type});
 return [label,value];
};
function lines(raw,max,size){
 const words=sanitize(raw).split(/\s+/),out=[];let cur='';
 for(let word of words){
   if(!word)continue;
   while(textW(word,size)>max){
     let chunk='';
     for(const c of word){if(textW(chunk+c,size)>max&&chunk)break;chunk+=c;}
     if(!chunk)chunk=word[0];
     if(cur){out.push(cur);cur='';}
     out.push(chunk);word=word.slice(chunk.length);
   }
   if(!word)continue;
   const next=cur?cur+' '+word:word;
   if(textW(next,size)>max&&cur){out.push(cur);cur=word;}else cur=next;
 }
 if(cur)out.push(cur);return out.length?out:[''];
}
class Paper{
 constructor(size){this.W=size.W;this.H=size.H;this.ops=[];}
 rect(x,y,w,h,col){this.ops.push(`${rgb(col)} rg ${x.toFixed(2)} ${(this.H-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);}
 rule(x,y,x2,y2,col=grid,width=.4){this.ops.push(`${rgb(col)} RG ${width} w ${x.toFixed(2)} ${(this.H-y).toFixed(2)} m ${x2.toFixed(2)} ${(this.H-y2).toFixed(2)} l S`);}
 text(x,y,value,{size=8,bold=false,color=ink,align='left'}={}){
   const s=sanitize(value),w=textW(s,size),at=align==='right'?x-w:align==='center'?x-w/2:x;
   this.ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${at.toFixed(2)} ${(this.H-y-size).toFixed(2)} Tm (${escape(s)}) Tj ET`);
 }
}
class Pdf{
 constructor(size){this.size=size;this.pages=[new Paper(size)];this.y=20;this.M=17;this.right=size.W-this.M;}
 get page(){return this.pages[this.pages.length-1];}
 newPage(){this.pages.push(new Paper(this.size));this.y=19;}
 need(h){if(this.y+h>this.size.H-22)this.newPage();}
 heading(report,def){
   const p=this.page,W=this.size.W;
   p.text(W/2,this.y,def.title+(def.modes?' — '+(report.mode==='pickup'?'Pickup':report.mode==='drop'?'Drop':'Pickup + Drop'):''),{size:13,bold:true,align:'center'});this.y+=26;
   p.text(this.M,this.y,report.operator_name||'Operator',{size:9.5,bold:true});this.y+=14;
   const generated=new Date().toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
   const base=[['Period:',report.from+' to '+report.to],['Generated:',generated]];
   if(report.staff?.name)base.push(['Staff:',report.staff.name]);
   if(report.mode&&def.modes)base.push(['Feeder leg:',report.mode==='both'?'Pickup + Drop':report.mode]);
   if(Array.isArray(report.pdf_context))for(const line of report.pdf_context)if(Array.isArray(line)&&line.length>=2)base.push([String(line[0]),String(line[1])]);
   const all=base.concat(def.metrics.map(m=>{const [k,v]=labelValue(report,m);
     const label=report.report==='station-performance'&&m[1]==='trips'?'Trips ('+String(report.summary?.schedules??0)+' schedules)':k;
     return [label+':',v];}));
   const split=Math.ceil(all.length/2),left=all.slice(0,split),right=all.slice(split);
   const starting=this.y,leftW=this.size.W*.60,labelX=this.M+this.size.W*.17;
   left.forEach(([a,b],i)=>{
      p.text(this.M,starting+i*11.2,a,{size:8.15,bold:true});
      p.text(labelX,starting+i*11.2,b,{size:8.15});
   });
   right.forEach(([a,b],i)=>{
      const x=leftW+2;p.text(x,starting+i*11.2,a,{size:8.15,bold:true});
      p.text(this.right,starting+i*11.2,b,{size:8.15,align:'right'});
   });
   this.y=starting+Math.max(left.length,right.length)*11.2+14;
 }
 table(sec,rows,totals){
   const margin=this.M,right=this.right,available=right-margin,cols=sec.cols;
   if(!cols.length)return;
   const unit=available/cols.reduce((s,c)=>s+(c.width||1),0);
   const ws=cols.map(c=>unit*(c.width||1));
   const small=Math.max(5.7,Math.min(8,9-cols.length*.18));
   const lineH=small*1.3,headerHeight=Math.max(17,Math.ceil(Math.max(...cols.map((c,i)=>lines(c.label,ws[i]-5,small).length))*lineH+5));
   const newHeader=()=>{
     this.need(35);
     this.page.rule(margin,this.y,right,this.y,this.documentStyle?ink:blue,1.2);
     this.page.text(margin,this.y+3,sec.title[0]+sec.title.slice(1).toLowerCase(),{size:9,bold:true});
     this.y+=18;
     this.page.rect(margin,this.y,available,headerHeight,this.documentStyle?[.92,.92,.92]:blue);
     let x=margin;
     cols.forEach((c,i)=>{
       const ll=lines(c.label,ws[i]-5,small);ll.forEach((l,j)=>this.page.text(x+2.5,this.y+2+j*lineH,l,{size:small,bold:true,color:this.documentStyle?ink:white}));
       x+=ws[i];
     });
     this.y+=headerHeight;
   };
   const repeat=()=>{this.newPage();newHeader();};
   newHeader();
   rows.forEach((row,i)=>{
     const cell=cols.map((c,j)=>lines(fmt(row,c),ws[j]-5,small));
     const height=Math.max(lineH+5,...cell.map(x=>x.length*lineH+5));
     if(this.y+height>this.size.H-22)repeat();
     if(i%2===0)this.page.rect(margin,this.y,available,height,shade);
     let x=margin;
     cols.forEach((c,j)=>{
       const align=['number','money','pct','ratio','delta','minutes','duration','speed'].includes(c.type)?'right':'left';
       cell[j].forEach((l,n)=>this.page.text(align==='right'?x+ws[j]-3:x+3,this.y+2+n*lineH,l,{size:small,color:slate,align}));
       this.page.rule(x,this.y,x,this.y+height,grid,.28);
       x+=ws[j];
     });
     this.page.rule(right,this.y,right,this.y+height,grid,.28);
     this.page.rule(margin,this.y+height,right,this.y+height,grid,.3);
     this.y+=height;
   });
   const total=totals||{};
   if(rows.length&&(!this.documentStyle||Object.keys(total).length)){
     const rowLines=cols.map((c,j)=>lines(total[c.key]===undefined?'':fmt(total,c),ws[j]-5,small));
     const h=Math.max(lineH+6,...rowLines.map(x=>x.length*lineH+6));
     if(this.y+h>this.size.H-22)repeat();
     this.page.rect(margin,this.y,available,h,totalColor);
     let x=margin;
     cols.forEach((c,j)=>{
       const align=['number','money','pct','ratio','delta','minutes','duration','speed'].includes(c.type)?'right':'left';
       rowLines[j].forEach((str,k)=>this.page.text(align==='right'?x+ws[j]-3:x+3,this.y+3+k*lineH,str,{size:small,bold:true,align}));
       this.page.rule(x,this.y,x,this.y+h,grid,.35);x+=ws[j];
     });
     this.page.rule(margin,this.y+h,right,this.y+h,grid,.4);this.y+=h;
   }
   this.y+=9;
 }
 file(){
   const objects=['<< /Type /Catalog /Pages 2 0 R >>','',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
   const kids=[];
   for(const p of this.pages){
     const stream=p.ops.join('\n')+'\n',buf=Buffer.from(stream,'latin1'),cid=objects.length+1;
     objects.push(`<< /Length ${buf.length} >>\nstream\n${stream}endstream`);
     const pid=objects.length+1;
     objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.size.W} ${this.size.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);
     kids.push(pid+' 0 R');
   }
   objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${this.pages.length} >>`;
   let str='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offsets=[0];
   for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(str,'latin1'));str+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
   const start=Buffer.byteLength(str,'latin1');
   str+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
   offsets.slice(1).forEach(o=>str+=String(o).padStart(10,'0')+' 00000 n \n');
   str+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
   return Buffer.from(str,'latin1');
 }
}
function generate(key,data){
 const def=DEF[key];if(!def)throw new Error('Unsupported report');
 if(def.needsStaff&&!data.staff?.id)throw new Error('Select a driver or staff member before exporting PDF');
 const pdf=new Pdf(def.pdf_orientation==='portrait'?portrait:landscape);pdf.heading(data,def);
 for(const sec of Specs.sections(key,data)){
    const rows=data.sections?.[sec.key]||[];
    pdf.table(sec,rows,data.totals?.[sec.key]||{});
 }
 return pdf.file();
}
module.exports={generate,Pdf,portrait};
