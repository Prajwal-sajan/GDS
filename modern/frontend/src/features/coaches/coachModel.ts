/** Coach21 v46 and Coach22 v47 original seat geometry, without renumbering any booking code. */
export type Deck = "LOWER" | "UPPER";
export type SeatKind = "seater" | "sleeper";
export type FixtureKind = "EE_EXIT" | "BACK_EXIT" | "ROOF_EXIT" | "WASH_ROOM";
export interface CoachSeatDraft {
  code:string;displayName:string|null;deck:Deck;row:number;col:number;
  width:number;length:number;seatType:SeatKind;isWindow:boolean;
}
export interface CoachFixtureDraft {
  code:string;displayName:string|null;type:FixtureKind;deck:Deck;
  row:number;col:number;width:number;length:number;orientation:string|null;
}
export interface CoachDraft {
  name:string;busType:string;pattern:"2+1"|"2+2";isAc:boolean;
  alternativeName:string|null;nominalSeaterPositions:number|null;
  amenities:string[];seats:CoachSeatDraft[];fixtures:CoachFixtureDraft[];
}
export interface FullCoach extends CoachDraft {
  id:number;capacity:number;vehicles:number;routes:number;structuralLocked:boolean;
}
export interface CoachListItem {
  id:number;name:string;busType:string;pattern:string;isAc:boolean;seatCount:number;
  seaterCount:number;sleeperCount:number;vehicles:number;routes:number;
}
export const defaultAmenities=[
  "Air Conditioning","Charging Points","Reading Light","Blanket","Water Bottle",
  "Wi-Fi","Emergency Exit","CCTV","Live GPS","Toilet","Pillow","Snack"
];
export function buildReferenceCoach(pattern:"2+1"|"2+2"):CoachDraft{
  const seats:CoachSeatDraft[]=[];
  const make=(code:string,deck:Deck,row:number,col:number,seatType:SeatKind,length=1)=>{
    seats.push({code,displayName:code,deck,row,col,width:1,length,seatType,
      isWindow:col===0||col===(pattern==="2+1"?3:4)});
  };
  const fixtures:CoachFixtureDraft[]=[];
  if(pattern==="2+1"){
    for(let k=0;k<6;k++)make(String(k+1)+"L","LOWER",k*2,0,"sleeper",2);
    for(let k=0;k<22;k++)make(String(k+1),"LOWER",Math.floor(k/2),2+k%2,"seater");
    for(let k=0;k<6;k++){
      make(String(k*3+3)+"U","UPPER",k*2,0,"sleeper",2);
      make(String(k*3+2)+"U","UPPER",k*2,2,"sleeper",2);
      make(String(k*3+1)+"U","UPPER",k*2,3,"sleeper",2);
    }
    fixtures.push({code:"Back Exit",displayName:"Back Exit",type:"BACK_EXIT",
      deck:"LOWER",row:11,col:1,width:1,length:1,orientation:null});
  }else{
    const skip=new Set([19,20,23,24]);
    for(let row=0;row<12;row++)for(let slot=0;slot<4;slot++){
      const n=row*4+slot+1;if(!skip.has(n))make(String(n),"LOWER",row,[0,1,3,4][slot],"seater");
    }
    fixtures.push(
      {code:"Side Exit",displayName:"Side Exit",type:"EE_EXIT",deck:"LOWER",row:4,col:4,width:1,length:1,orientation:null},
      {code:"Toilet",displayName:"Toilet",type:"WASH_ROOM",deck:"LOWER",row:5,col:3,width:2,length:1,orientation:"Horizontal"},
      {code:"Roof Exit",displayName:"Roof Exit",type:"ROOF_EXIT",deck:"LOWER",row:7,col:2,width:1,length:1,orientation:null},
      {code:"Back Exit",displayName:"Back Exit",type:"BACK_EXIT",deck:"LOWER",row:11,col:2,width:1,length:1,orientation:null}
    );
  }
  return {name:pattern==="2+1"?"A/C Seater/Sleeper (2+1)":"A/C Seater (2+2)",
    busType:pattern==="2+1"?"A/C Seater/Sleeper":"A/C Seater",
    pattern,isAc:true,alternativeName:null,nominalSeaterPositions:pattern==="2+2"?48:22,
    amenities:[],seats,fixtures};
}
export function coachCount(d:CoachDraft){
  return {seaters:d.seats.filter(x=>x.seatType==="seater").length,
    sleepers:d.seats.filter(x=>x.seatType==="sleeper").length,
    total:d.seats.length,upper:d.seats.filter(x=>x.deck==="UPPER").length};
}
export function formatPosition(item:{row:number;col:number;width:number;length:number},deck:Deck):string{
  const out:string[]=[];
  for(let r=0;r<item.length;r++)for(let c=0;c<item.width;c++)
    out.push("R"+(item.row+r+1)+"C"+(item.col+c+1)+"Z"+(deck==="LOWER"?"0":"1"));
  return out.join(", ");
}
export function structuralSignature(d:CoachDraft):string{
  return JSON.stringify({pattern:d.pattern,isAc:d.isAc,busType:d.busType,
    seats:d.seats.map(x=>[x.code,x.deck,x.row,x.col,x.width,x.length,x.seatType,x.isWindow]).sort(),
    fixtures:d.fixtures.map(x=>[x.code,x.deck,x.row,x.col,x.width,x.length,x.type]).sort()});
}
export function checkCoachDraft(d:CoachDraft):void{
  if(!d.name.trim()||d.name.length>120)throw Error("Enter coach name (max 120 characters).");
  if(!["2+1","2+2"].includes(d.pattern))throw Error("Unsupported coach pattern.");
  if(d.seats.length<1||d.seats.length>120)throw Error("Coach requires 1–120 passenger seats.");
  const cells=new Set<string>(),codes=new Set<string>(),names=new Set<string>();
  const width=d.pattern==="2+1"?4:5,aisle=d.pattern==="2+1"?1:2;
  function mark(x:{code:string;deck:Deck;row:number;col:number;width:number;length:number},label:string){
    if(x.row<0||x.row+x.length>16||x.col<0||x.col+x.width>width||
      x.width<1||x.length<1||!["LOWER","UPPER"].includes(x.deck))
      throw Error("Invalid grid cell for "+x.code);
    const code=x.code.toUpperCase(),alias=label.toUpperCase();
    if(codes.has(code)||names.has(alias))throw Error("Duplicate seat/fixture ID or display label: "+x.code);
    codes.add(code);names.add(alias);
    for(let r=x.row;r<x.row+x.length;r++)for(let c=x.col;c<x.col+x.width;c++){
      const key=x.deck+":"+r+":"+c;
      if(cells.has(key))throw Error("Overlapping physical position at "+key);
      cells.add(key);
    }
  }
  for(const s of d.seats){
    if(!/^[\p{L}\p{N}_-]{1,24}$/u.test(s.code)||!["seater","sleeper"].includes(s.seatType)||
      s.width!==1||s.length!==(s.seatType==="seater"?1:2)||s.col===aisle)
      throw Error("Invalid seat code or geometry: "+s.code);
    if(d.pattern==="2+2"&&(s.deck!=="LOWER"||s.seatType!=="seater"||
      ([4,5].includes(s.row)&&s.col>=3)))
      throw Error("2+2 side exit and toilet clearance must remain unoccupied.");
    mark(s,s.displayName?.trim()||s.code);
  }
  for(const f of d.fixtures)mark(f,f.displayName?.trim()||f.code);
}
export function addSeatAtVacancy(d:CoachDraft,code:string,deck:Deck,kind:SeatKind):CoachDraft{
  if(!/^[\p{L}\p{N}_-]{1,24}$/u.test(code))throw Error("Enter a unique valid seat ID.");
  if(d.seats.some(s=>s.code.toUpperCase()===code.toUpperCase())||
    d.fixtures.some(s=>s.code.toUpperCase()===code.toUpperCase()))throw Error("Seat ID already exists.");
  if(d.pattern==="2+2"&&(deck!=="LOWER"||kind!=="seater"))throw Error("2+2 is lower-deck seater only.");
  const occupied=new Set<string>();
  const fill=(de:Deck,row:number,col:number,w:number,h:number)=>{
    for(let r=row;r<row+h;r++)for(let c=col;c<col+w;c++)occupied.add(de+":"+r+":"+c);
  };
  for(const s of d.seats)fill(s.deck,s.row,s.col,s.width,s.length);
  for(const f of d.fixtures)fill(f.deck,f.row,f.col,f.width,f.length);
  if(d.pattern==="2+2")for(const row of [4,5])for(const col of [3,4])fill("LOWER",row,col,1,1);
  const cols=d.pattern==="2+1"?[0,2,3]:[0,1,3,4],h=kind==="sleeper"?2:1;
  for(let row=0;row+h<=16;row++)for(const col of cols){
    if(Array.from({length:h},(_,i)=>occupied.has(deck+":"+(row+i)+":"+col)).some(Boolean))continue;
    const next:CoachDraft={...d,seats:[...d.seats,{code,displayName:code,deck,row,col,width:1,length:h,
      seatType:kind,isWindow:col===0||col===(d.pattern==="2+1"?3:4)}]};
    checkCoachDraft(next);
    return next;
  }
  throw Error("No safe unoccupied seat position is available.");
}
