'use strict';
const zlib=require('node:zlib');
const S=require('../public/js/report-suite-specs-v22.js');
const escape=x=>String(x??'').replace(/[<>&"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number=x=>typeof x==='number'&&Number.isFinite(x);
function crc32(buf){
 if(!crc32.table){crc32.table=Array.from({length:256},(_,i)=>{
   let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;
 });}
 let c=0xFFFFFFFF;for(const b of buf)c=crc32.table[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;
}
function zip(files){
 const locals=[],centrals=[];let offset=0;
 for(const [name,content] of files){
   const filename=Buffer.from(name),plain=Buffer.from(content,'utf8'),compressed=zlib.deflateRawSync(plain,{level:6}),crc=crc32(plain);
   const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0,6);
   head.writeUInt16LE(8,8);head.writeUInt32LE(crc,14);head.writeUInt32LE(compressed.length,18);
   head.writeUInt32LE(plain.length,22);head.writeUInt16LE(filename.length,26);
   const local=Buffer.concat([head,filename,compressed]);locals.push(local);
   const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
   central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);
   central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(plain.length,24);
   central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
   centrals.push(Buffer.concat([central,filename]));offset+=local.length;
 }
 const catalog=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(catalog.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,catalog,end]);
}
function ref(i){let out='';while(i){i--;out=String.fromCharCode(65+i%26)+out;i=Math.floor(i/26);}return out;}
function cell(val,col,row,heading=false){
 const id=ref(col)+row;
 if(number(val)){const style=heading?1:0;return `<c r="${id}" s="${style}"><v>${val}</v></c>`;}
 // Excel formula-injection prevention: always use inline string (never formula cells).
 const value=String(val??'');
 return `<c r="${id}" s="${heading?1:0}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
}
function worksheet(title,period,cols,rows,totals){
 const width=cols.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.max(10,Math.min(44,(c.width||1)*11))}" customWidth="1"/>`).join('');
 const all=[
  [title],[period],[],cols.map(x=>x.label),
  ...rows.map(r=>cols.map(c=>r[c.key]??'')),
  cols.map((c,i)=>totals[c.key]??(i===0?'Total':''))
 ];
 const content=all.map((cells,index)=>{
   const row=index+1,header=index===3||index===all.length-1;
   const payload=cells.map((v,i)=>cell(v,i+1,row,header)).join('');
   return `<row r="${row}">${payload}</row>`;
 }).join('');
 const maxRow=all.length,autoFilter=`<autoFilter ref="A4:${ref(cols.length)}${Math.max(4,maxRow-1)}"/>`;
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
 <cols>${width}</cols><sheetData>${content}</sheetData>
 ${autoFilter}</worksheet>`;
}
function generate(key,data){
 const spec=S.DEF[key];if(key!=='frequent-travellers')throw new Error('Excel export is available for Frequent Travellers');
 const sheets=spec.sections.map((s,i)=>({
   name:i===0?'Frequent Travellers':'Trip Count Distribution',
   xml:worksheet(i===0?'Frequent Travellers':'All Passengers by Trip Count',
    data.from+' to '+data.to,s.cols,data.sections[s.key]||[],data.totals[s.key]||{})
 }));
 const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets>${sheets.map((s,i)=>`<sheet name="${escape(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
 const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 ${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}
 <Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
 <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills>
 <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
 <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
 <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
 <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>`;
 const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
 ${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
 const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
 const files=[['[Content_Types].xml',types],['_rels/.rels',rootRels],['xl/workbook.xml',workbook],
   ['xl/_rels/workbook.xml.rels',workbookRels],['xl/styles.xml',styles],
   ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,s.xml])];
 return zip(files);
}
module.exports={generate};
