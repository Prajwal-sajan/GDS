'use strict';
/* v40: vendor-aware text-PDF/CSV preview importer.
 * Imported tripsheets are separate external manifests; they NEVER change
 * seat inventory, financial ledgers or confirmed GDS tickets. */
const crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const D=require('./domain'),C=require('./pickup-chart-v40'),db=require('./db');
const SOURCES=['Bitla TicketSimply','EzeeInfo','Infinity ITS','Detect automatically'];
const MAX=15*1024*1024,TTL=20*60*1000,previews=new Map();
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'');
const keyMap={
 seat:['seat','seatno','seatnumber','berth','seatid'],
 mobile:['mobile','mobilephone','mobileno','phone','contact','contactno','phonenumber'],
 pnr:['pnr','ticketno','ticketnumber','ticketid','bookingid','bookingnumber'],
 name:['name','passenger','passengername','traveller','traveler','customer'],
 gender:['g','gender','sex'],age:['age'],contact_name:['contactname','bookedby'],
 trips:['trips','tripcount','totaltrips','journeys'],
 from_city:['fromcity','sourcecity','origin'],to_city:['tocity','destination','destinationcity'],
 pickup:['pickup','boarding','boardingpoint','boardingat','pickuppoint','board'],
 drop:['drop','dropping','droppingpoint','dropoff','droppoint'],
 fare:['fare','amount','ticketfare','price'],source:['source','channel','bookingchannel','via'],
 booked_on:['bookedon','bookingdate','bookedat','bookingtime','createdon']
};
const headerField=x=>Object.entries(keyMap).find(([,aliases])=>aliases.includes(norm(x)))?.[0]||null;
function csvRows(text){
 const result=[];let row=[],field='',quoted=false;
 const raw=String(text||'').replace(/^\uFEFF/,'');
 const first=raw.split(/\r?\n/,1)[0]||'';
 const delimiter=first.includes('\t')?'\t':first.includes('|')?'|':',';
 for(let i=0;i<raw.length;i++){
  const ch=raw[i];
  if(ch==='"'&&quoted&&raw[i+1]==='"'){field+='"';i++;continue;}
  if(ch==='"'){quoted=!quoted;continue;}
  if(!quoted&&ch===delimiter){row.push(field);field='';continue;}
  if(!quoted&&(ch==='\n'||ch==='\r')){
   if(ch==='\r'&&raw[i+1]==='\n')i++;
   row.push(field);if(row.some(x=>String(x).trim()))result.push(row);
   row=[];field='';continue;
  }
  field+=ch;
 }
 if(quoted)throw D.httpErr(422,'CSV contains an unclosed quoted cell');
 row.push(field);if(row.some(x=>String(x).trim()))result.push(row);
 return result;
}
function rowsFromCsv(text){
 const table=csvRows(text);
 const i=table.findIndex(r=>r.filter(x=>headerField(x)).length>=3&&r.some(x=>headerField(x)==='seat'));
 if(i<0)throw D.httpErr(422,'CSV must have a header with Seat, PNR and Name fields');
 const names=table[i].map(headerField);
 if(!['seat','pnr','name'].every(k=>names.includes(k)))throw D.httpErr(422,'CSV must include Seat, PNR, Name');
 const rows=[];
 for(const raw of table.slice(i+1)){
  const data={};names.forEach((name,index)=>{if(name&&data[name]===undefined)data[name]=raw[index]||''});
  if(!C.safe(data.seat)&&!C.safe(data.name))continue;
  rows.push(data);
 }
 return rows;
}
function pdfText(buffer){
 if(buffer.length<8||!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))
  throw D.httpErr(415,'The uploaded file is not a PDF');
 const bin=process.env.GDS_PDFTOTEXT_PATH||'pdftotext';
 const out=spawnSync(bin,['-layout','-','-'],{input:buffer,encoding:'utf8',maxBuffer:12*1024*1024,timeout:12000,
   windowsHide:true});
 if(out.error?.code==='ENOENT')throw D.httpErr(503,
  'PDF text parser is unavailable on this server. Install Poppler pdftotext (or configure GDS_PDFTOTEXT_PATH); CSV import is available.');
 if(out.error||out.status!==0)throw D.httpErr(422,'Cannot extract text from this PDF. Use a searchable/text PDF or CSV; scanned images require a separate OCR workflow.');
 if(!out.stdout?.trim())throw D.httpErr(422,'PDF has no extractable text; scanned PDFs are not automatically imported');
 return out.stdout;
}
function hh24(str){
 const m=String(str||'').match(/(\d{1,2}):(\d\d)\s*(AM|PM)/i);
 if(!m)return '';
 const hr=(Number(m[1])%12)+(m[3].toUpperCase()==='PM'?12:0);
 return String(hr).padStart(2,'0')+':'+m[2];
}
function rowsFromPdf(text){
 const rows=[];let boarding='',boardTime='',boardDay=1;
 let skipped=0,section='passengers';
 for(const line of text.split(/\r?\n/)){
  if(/^\s*Boarding Details\s*$/i.test(line)||/^\s*Dropping Details\s*$/i.test(line)){
   section='summary';continue;
  }
  if(section==='summary')continue;
  const stop=line.match(/^\s*(.*?)\s+Day\s+(\d+)\s*-\s*(\d{1,2}:\d\d\s*[AP]M)/i);
  if(stop&&!/^\s*\d+\s+/.test(line)){
   boarding=stop[1].trim();boardTime=hh24(stop[3]);boardDay=Number(stop[2])||1;continue;
  }
  if(!/^\s*\d+\s+\d{1,3}[A-Za-z]?\s+/.test(line))continue;
  let parts=line.trim().split(/\s{2,}/).map(x=>x.trim()).filter(Boolean);
  // Some third-party PDFs use tabulation or narrower font-column spacing.
  if(parts.length<8)parts=line.trim().split(/\t+/).map(x=>x.trim()).filter(Boolean);
  const hasIndex=Number.isInteger(Number(parts[0]));
  if(!hasIndex||!/^\d{1,3}[A-Za-z]?$/.test(parts[1]||'')){skipped++;continue;}
  if(parts.length>=11&&/^[MFO]$/i.test(parts[5]||'')){
   rows.push({seat:parts[1],mobile:parts[2],pnr:parts[3],name:parts[4],
    gender:parts[5],trips:parts[6],drop:parts[7],fare:parts[8],
    source:parts[9],booked_on:parts.slice(10).join(' '),pickup:boarding,
    pickup_time:boardTime,pickup_day:boardDay});
  }else if(parts.length>=8&&/^[MFO]$/i.test(parts[5]||'')){
   rows.push({seat:parts[1],mobile:parts[2],pnr:parts[3],name:parts[4],
    gender:parts[5],pickup:parts[6]||boarding,drop:parts[7]||'',
    pickup_time:boardTime,pickup_day:boardDay});
  }else skipped++;
 }
 return {rows,skipped};
}
const detect=(text,selection)=>{
 if(selection!=='Detect automatically')return selection;
 if(/ticketsimply|bitla/i.test(text))return 'Bitla TicketSimply';
 if(/ezeeinfo|ezee info/i.test(text))return 'EzeeInfo';
 if(/infinity\s*(its|solutions|gds)/i.test(text))return 'Infinity ITS';
 return 'Unknown text PDF / CSV';
};
function assignStages(rows,report){
 const list=report.stages,normalize=norm;
 const match=(value,type)=>{
  const same=list.filter(s=>s.type===type&&(normalize(s.name)===normalize(value)||normalize(value).startsWith(normalize(s.name))));
  return same.length===1?same[0]:null;
 };
 const boardCity=list.find(s=>s.type==='pickup')?.city_id,dropCity=list.filter(s=>s.type==='drop').slice(-1)[0]?.city_id;
 const warnings=[];
 for(let i=0;i<rows.length;i++){
  const x=rows[i];
  const b=match(x.pickup,'pickup'),d=match(x.drop,'drop');
  x.boarding_id=b?String(b.id):'';
  x.dropping_id=d?String(d.id):'';
  x.boarding_order=b?list.indexOf(b):9999;
  x.dropping_order=d?list.indexOf(d):9999;
  x.boarded_city_id=b?String(b.city_id):String(boardCity||'');
  x.dropped_city_id=d?String(d.city_id):String(dropCity||'');
  x.from_city=b?D.cityName(b.city_id):report.origin;
  x.to_city=d?D.cityName(d.city_id):report.destination;
  if(b){
   x.pickup_time=x.pickup_time||b.time;x.pickup_day=x.pickup_day||b.day||1;
   x.exchange_point=x.exchange_point||b.exchange_point||'';
   x.exchange_time=x.exchange_time||b.exchange_time||'';
  }else if(x.pickup)warnings.push('Passenger '+(i+1)+': pickup "'+x.pickup+'" does not match a configured schedule stage');
  if(d){x.drop_time=x.drop_time||d.time;x.drop_day=x.drop_day||d.day||1}
  else if(x.drop)warnings.push('Passenger '+(i+1)+': drop "'+x.drop+'" does not match a configured schedule stage');
 }
 return warnings;
}
function normalizeRow(r){
 const raw=x=>C.safe(x).slice(0,180);
 const seat=raw(r.seat).toUpperCase(),pnr=raw(r.pnr);
 const name=raw(r.name),gender=raw(r.gender).toUpperCase().slice(0,1);
 if(!/^[A-Z0-9-]{1,8}$/.test(seat)||!/^[A-Za-z0-9/-]{4,40}$/.test(pnr)||!name)return null;
 const amount=String(r.fare??'').replace(/[^0-9.]/g,'');
 const ph=raw(r.mobile).replace(/\D/g,'');
 return {seat,pnr,internal_pnr:pnr,mobile:ph.length===10?ph:'',
  name,gender:gender==='M'||gender==='F'||gender==='O'?gender:'',
  age:r.age?Number(r.age)||'':'',contact_name:raw(r.contact_name),
  trips:Number(r.trips)||'',from_city:raw(r.from_city),to_city:raw(r.to_city),
  pickup:raw(r.pickup),drop:raw(r.drop),pickup_time:raw(r.pickup_time),
  drop_time:raw(r.drop_time),pickup_day:Number(r.pickup_day)||1,
  drop_day:Number(r.drop_day)||1,exchange_point:raw(r.exchange_point),
  exchange_time:raw(r.exchange_time),fare:amount?Number(amount):null,
  source:raw(r.source),booked_on:raw(r.booked_on)};
}
function parse(buffer,mime,filename,selection,report){
 if(!SOURCES.includes(selection))throw D.httpErr(400,'Choose a supported GDS or Detect automatically');
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX)throw D.httpErr(413,'Choose a file up to 15 MB');
 if(!/\.(pdf|csv)$/i.test(filename))throw D.httpErr(415,'Only searchable PDF and CSV files are supported');
 if(mime==='application/pdf'&&!/\.pdf$/i.test(filename))throw D.httpErr(415,'File extension and content type mismatch');
 if(mime==='text/csv'&&!/\.csv$/i.test(filename))throw D.httpErr(415,'File extension and content type mismatch');
 let text,parsed;
 if(mime==='application/pdf'){text=pdfText(buffer);parsed=rowsFromPdf(text)}
 else{text=buffer.toString('utf8');parsed={rows:rowsFromCsv(text),skipped:0}}
 const rows=parsed.rows.map(normalizeRow).filter(Boolean).slice(0,1000);
 if(!rows.length)throw D.httpErr(422,'No complete passenger rows were extracted; no chart has been imported');
 const service=text.match(/(?:^|\n)\s*Service:\s*([A-Za-z0-9-]+)/i)?.[1]||null;
 const date=text.match(/(?:^|\n)\s*Date:\s*(\d{4}-\d\d-\d\d)/i)?.[1]||null;
 const blocked=[];
 if(service&&norm(service)!==norm(report.service))blocked.push('Service '+service+' does not match '+report.service);
 if(date&&date!==report.date)blocked.push('Travel date '+date+' does not match '+report.date);
 const warnings=assignStages(rows,report);
 if(parsed.skipped)warnings.push(parsed.skipped+' potential passenger row(s) were not recognized');
 if(!rows.every(x=>x.mobile))warnings.push('One or more passenger phone numbers were absent or invalid');
 const repeated=[...new Set(rows.map(x=>x.seat).filter((s,i,a)=>a.indexOf(s)!==i))];
 if(repeated.length)warnings.push('Repeated seat codes across this manifest: '+repeated.slice(0,15).join(', '));
 const hash=crypto.createHash('sha256').update(buffer).digest('hex');
 return {file_name:C.safe(filename).slice(0,180),sha256:hash,bytes:buffer.length,
  source_selection:selection,source_gds:detect(text,selection),mime,service,date,
  rows,warnings:[...new Set(warnings)].slice(0,75),blocking_issues:blocked};
}
function storePreview(userId,sid,result){
 for(const [k,v] of previews)if(Date.now()>v.expires)previews.delete(k);
 const id=crypto.randomUUID();
 previews.set(id,{id,user_id:String(userId),schedule_id:String(sid),expires:Date.now()+TTL,data:result});
 return id;
}
function commitPreview(id,userId,sid){
 const record=previews.get(String(id));
 if(!record||record.user_id!==String(userId)||record.schedule_id!==String(sid)||
  record.expires<Date.now())throw D.httpErr(404,'Upload preview expired; select the PDF/CSV again');
 if(record.data.blocking_issues.length)throw D.httpErr(409,'Resolve mismatched service/date before importing this chart');
 const {rows,sha256,source_gds,source_selection,file_name,bytes,warnings}=record.data;
 const saved=db.col('pickup_chart_imports_v40').insert({schedule_id:sid,
  rows,sha256,source_gds,source_selection,file_name,bytes,warnings,
  imported_at:new Date().toISOString(),imported_by:userId,kind:'external_reference_chart'});
 previews.delete(String(id));
 return saved;
}
module.exports={SOURCES,MAX,rowsFromPdf,rowsFromCsv,csvRows,parse,storePreview,commitPreview,detect,hh24};
