import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { addSeatAtVacancy, buildReferenceCoach, checkCoachDraft, coachCount,
  defaultAmenities, formatPosition, structuralSignature,
  type CoachDraft, type CoachListItem,
  type CoachSeatDraft, type Deck, type FullCoach, type SeatKind } from "./coachModel";
import "./coaches.css";

const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const char=(v:unknown)=>String(v??"");
const stable=(d:CoachDraft)=>JSON.parse(JSON.stringify(d)) as CoachDraft;
type EditorTab="type"|"amenities"|"seats";
const patternOptions=["2+1","2+2"] as const;

function projectedSeats(d:CoachDraft):CoachSeatDraft[]{
  const one=d.seats.find(s=>s.code==="1L"&&s.deck==="LOWER");
  const chair=d.seats.find(s=>s.code==="1"&&s.deck==="LOWER");
  const u1=d.seats.find(s=>s.code==="1U"&&s.deck==="UPPER");
  const u3=d.seats.find(s=>s.code==="3U"&&s.deck==="UPPER");
  const legacy=d.pattern==="2+1"&&one?.col===3&&chair?.col===0&&u1?.col===0&&u3?.col===3;
  return d.seats.map(s=>{
    if(!legacy)return s;
    if(s.deck==="LOWER"){
      if(s.seatType==="sleeper"&&/^\d+L$/.test(s.code))return {...s,col:0};
      if(s.seatType==="seater"&&[0,1].includes(s.col))return {...s,col:s.col+2};
    }
    if(s.deck==="UPPER"&&/^\d+U$/.test(s.code)){
      return {...s,col:s.col===3?0:s.col===1?2:s.col===0?3:s.col};
    }
    return s;
  });
}
function CoachIcon({kind}:{kind:"bus"|"wheel"|"exit"|"wash"|"close"|"check"|"search"|"trash"}){
  if(kind==="wheel")return <svg viewBox="0 0 52 52" width="48" height="48" aria-label="Driver steering wheel" role="img">
    <circle cx="26" cy="26" r="24" fill="#245acf" stroke="#a9c9ff" strokeWidth="3"/>
    <circle cx="26" cy="26" r="19" fill="none" stroke="#fff" strokeWidth="3"/>
    <path d="M26 12v14l-13 8m13-8 13 8" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
    <circle cx="26" cy="26" r="5.5" fill="#9cc5ff"/></svg>;
  const path:Record<string,string>={
    bus:"M4 16V7a3 3 0 013-3h10a3 3 0 013 3v9H4zm0-5h16M7 20v-4m10 4v-4M6 20h12",
    exit:"M18 3v18M3 12h13m-5-5 5 5-5 5",
    wash:"M7 3a2 2 0 110 4 2 2 0 010-4zm9 0a2 2 0 110 4 2 2 0 010-4zM7 10v4l-2 6m2-6 2 6m7-10v4l-2 6m2-6 2 6",
    close:"M5 5l14 14M19 5L5 19",
    check:"M4 12l5 5L20 6",
    search:"M21 21l-4.5-4.5M19 10a9 9 0 11-18 0 9 9 0 0118 0",
    trash:"M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 10v8m4-8v8"
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path[kind]}/></svg>;
}
function CoachDiagram({draft}:{draft:CoachDraft}){
  const visible=projectedSeats(draft);
  const decks:Deck[]=draft.pattern==="2+1"?["LOWER","UPPER"]:["LOWER"];
  return <div className="cm-diagram-wrap" data-testid="coach-diagram">
    <div className="cm-diagram-decks">
      {decks.map(deck=><section className="cm-deck" aria-label={deck+" coach deck"} key={deck}>
        <header className="cm-deck-head"><b>{deck}</b>
          {deck==="LOWER"&&<CoachIcon kind="wheel"/>}</header>
        <div className="cm-deck-divider"/>
        <div className="cm-diagram-grid" style={{
          gridTemplateColumns:"repeat("+(draft.pattern==="2+1"?4:5)+", minmax(38px, 1fr))",
          gridTemplateRows:"repeat(12, 48px)"
        }}>
          {visible.filter(s=>s.deck===deck).map(s=><div key={s.code}
            className={"cm-seat-shape cm-"+s.seatType}
            style={{gridColumn:(s.col+1)+" / span "+s.width,gridRow:(s.row+1)+" / span "+s.length}}
            title={s.code+" · "+s.seatType+" · "+formatPosition(s,deck)}
            data-seat-code={s.code}><span>{char(s.displayName)||s.code}</span><i/></div>)}
          {draft.fixtures.filter(f=>f.deck===deck).map(f=><div key={f.code}
            className={"cm-fixture cm-"+f.type.toLowerCase()}
            style={{gridColumn:(f.col+1)+" / span "+f.width,gridRow:(f.row+1)+" / span "+f.length}}
            title={f.code+" · "+formatPosition(f,deck)}>
            {f.type==="WASH_ROOM"?<CoachIcon kind="wash"/>:<CoachIcon kind="exit"/>}
            <small>{f.displayName||f.code}</small>
          </div>)}
        </div>
        <div className="cm-deck-foot">
          {deck==="LOWER"&&draft.fixtures.some(f=>f.deck==="LOWER"&&f.type==="BACK_EXIT")&&
            <span className="cm-backdoor" aria-label="Rear emergency door"/>}
        </div>
      </section>)}
    </div>
  </div>;
}
function CoachEditor({original,onClose,onSave}:{original:FullCoach|CoachDraft;onClose:()=>void;onSave:(draft:CoachDraft,id?:number)=>Promise<void>}){
  const id=("id" in original)?original.id:undefined;
  const locked=("structuralLocked" in original)&&original.structuralLocked;
  const [draft,setDraft]=useState<CoachDraft>(()=>stable(original));
  const [tab,setTab]=useState<EditorTab>("seats");
  const [search,setSearch]=useState("");
  const [seatCode,setSeatCode]=useState("");
  const [seatKind,setSeatKind]=useState<SeatKind>("seater");
  const [seatDeck,setSeatDeck]=useState<Deck>("LOWER");
  const [showAdd,setShowAdd]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const closeButton=useRef<HTMLButtonElement>(null);
  const baseline=useMemo(()=>structuralSignature(original),[original]);
  const counts=coachCount(draft);
  const change=(p:Partial<CoachDraft>)=>setDraft(old=>({...old,...p}));
  useEffect(()=>{
    closeButton.current?.focus();
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",escape);
    return ()=>document.removeEventListener("keydown",escape);
  },[onClose]);
  const setAlias=(code:string,fixture:boolean,value:string)=>{
    setDraft(old=>fixture?{...old,fixtures:old.fixtures.map(s=>s.code===code?{...s,displayName:value}:s)}:
      {...old,seats:old.seats.map(s=>s.code===code?{...s,displayName:value}:s)});
  };
  const removeItem=(code:string,fixture:boolean)=>{
    if(locked)return;
    if(!window.confirm("Remove "+code+" from the unsaved coach layout? Existing bookings are unaffected until a successful authorized save."))return;
    change(fixture?{fixtures:draft.fixtures.filter(x=>x.code!==code)}:{seats:draft.seats.filter(x=>x.code!==code)});
  };
  const resetNames=()=>{
    if(!window.confirm("Reset all unsaved seat and fixture display names to their immutable IDs?"))return;
    change({seats:draft.seats.map(s=>({...s,displayName:s.code})),
      fixtures:draft.fixtures.map(f=>({...f,displayName:f.code}))});
  };
  const generate=()=>{
    if(locked)return;
    if(!window.confirm("Replace unsaved physical geometry with the canonical reference "+draft.pattern+" layout?"))return;
    const next=buildReferenceCoach(draft.pattern);
    change({seats:next.seats,fixtures:next.fixtures,nominalSeaterPositions:next.nominalSeaterPositions});
    setError("");
  };
  const add=()=>{
    if(locked)return;
    try{
      setDraft(addSeatAtVacancy(draft,seatCode.trim(),seatDeck,seatKind));
      setSeatCode("");setShowAdd(false);setError("");
    }catch(e){setError(errorText(e));}
  };
  const save=async()=>{
    if(saving)return;
    try{
      checkCoachDraft(draft);
      if(locked&&structuralSignature(draft)!==baseline)
        throw Error("This coach is assigned. Only display names and amenities can change; clone the coach to change its geometry.");
      setError("");setSaving(true);
      await onSave(draft,id);
    }catch(e){setError(errorText(e));}finally{setSaving(false);}
  };
  const coachTable=[...draft.seats.map((x,i)=>({code:x.code,
    label:x.displayName||x.code,deck:x.deck,row:x.row,col:x.col,width:x.width,length:x.length,
    type:x.seatType.toUpperCase(),orientation:x.seatType==="sleeper"?"↕ Vertical":"—",
    fixture:false,rank:i})),...draft.fixtures.map((x,i)=>({...x,label:x.displayName||x.code,
    type:x.type,fixture:true,rank:i+draft.seats.length,orientation:x.orientation||"—"}))]
    .filter(x=>!search||[x.code,x.label,x.type,x.deck].some(y=>y.toLowerCase().includes(search.toLowerCase())));
  return <div className="cm-backdrop">
    <section role="dialog" aria-modal="true" aria-labelledby="coach-modal-title" className="cm-modal">
      <header className="cm-modal-heading">
        <div className="cm-modal-icon"><CoachIcon kind="bus"/></div>
        <div className="cm-title"><h2 id="coach-modal-title">{id?"Edit Coach":"Add Coach"}</h2>
          <p>{draft.name} {locked&&"· Assigned physical inventory is protected"}</p></div>
        <button ref={closeButton} type="button" className="cm-close" aria-label="Close Coach Editor"
          onClick={onClose}><CoachIcon kind="close"/></button>
      </header>
      <nav className="cm-editor-tabs" aria-label="Coach editor tabs">
        {([{value:"type",label:"Coach Type"},{value:"amenities",label:"Amenities"},
          {value:"seats",label:"Seat Layout"}] as const).map(x=><button key={x.value}
          type="button" aria-current={tab===x.value?"page":undefined}
          className={tab===x.value?"active":""} onClick={()=>setTab(x.value)}>{x.label}</button>)}
      </nav>
      <div className="cm-modal-scroll">
        {error&&<div className="cm-alert" role="alert">{error}</div>}
        {locked&&<div className="cm-assigned-warning">
          <strong>Assigned coach — physical layout locked</strong>
          <p>{("vehicles" in original)?original.vehicles:0} vehicle(s), {("routes" in original)?original.routes:0} route(s) reference this coach. Seat IDs, positions, fixtures and count cannot change. Display labels and amenities may be edited.</p>
        </div>}
        {tab==="type"&&<section className="cm-edit-card">
          <h3>Coach Type</h3>
          <div className="cm-config-form">
            <label>Coach Name *<input value={draft.name} maxLength={120}
              aria-label="Coach name" onChange={e=>change({name:e.target.value})}/></label>
            <label>Alternative Name<input value={draft.alternativeName||""}
              aria-label="Alternative coach name" maxLength={120}
              onChange={e=>change({alternativeName:e.target.value})}/></label>
            <label>Bus Type *<select value={draft.busType} disabled={locked}
              aria-label="Bus type" onChange={e=>change({busType:e.target.value})}>
              {["A/C Seater/Sleeper","A/C Seater","Non A/C Seater","Non A/C Sleeper"].map(x=>
                <option key={x}>{x}</option>)}
              {!["A/C Seater/Sleeper","A/C Seater","Non A/C Seater","Non A/C Sleeper"].includes(draft.busType)&&
                <option value={draft.busType}>{draft.busType}</option>}
            </select></label>
            <label>Layout Pattern<select value={draft.pattern} aria-label="Layout pattern"
              disabled={locked} onChange={e=>{
                const v=e.target.value as "2+1"|"2+2";
                if(!window.confirm("Switch coach layout? This replaces the unsaved physical seats and fixtures."))return;
                const next=buildReferenceCoach(v);
                change({...next,name:draft.name,alternativeName:draft.alternativeName,amenities:draft.amenities});
              }}>{patternOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
            <label className="cm-checkbox"><input type="checkbox" checked={draft.isAc} disabled={locked}
              onChange={e=>change({isAc:e.target.checked})}/> Air Conditioned</label>
            <label>Nominal Seater Positions<input type="number" min={0} max={120} disabled={locked}
              value={draft.nominalSeaterPositions??""} onChange={e=>change({nominalSeaterPositions:Number(e.target.value)})}/></label>
          </div>
        </section>}
        {tab==="amenities"&&<section className="cm-edit-card">
          <h3>Amenities</h3><p className="cm-subtle">Select equipment truly present on the operator's coach. Amenities do not modify passenger seat inventory.</p>
          <div className="cm-amenity-grid">{defaultAmenities.map(a=><label key={a}
            className={"cm-amenity"+(draft.amenities.includes(a)?" selected":"")}>
            <input type="checkbox" checked={draft.amenities.includes(a)}
              onChange={e=>change({amenities:e.target.checked?[...draft.amenities,a]:
                draft.amenities.filter(x=>x!==a)})}/>{a}</label>)}</div>
          <label className="cm-custom-amenity">Other coach amenity <input
            aria-label="Custom amenity" maxLength={60}
            placeholder="Enter a supported coach amenity" onKeyDown={e=>{
              if(e.key!=="Enter")return;
              e.preventDefault();
              const v=e.currentTarget.value.trim();
              if(v&&!draft.amenities.includes(v)&&draft.amenities.length<60){
                change({amenities:[...draft.amenities,v]});e.currentTarget.value="";
              }
            }}/></label>
          <div className="cm-extra-amenities">{draft.amenities.filter(x=>!defaultAmenities.includes(x))
            .map(a=><button key={a} type="button" onClick={()=>change({amenities:draft.amenities.filter(x=>x!==a)})}>
              {a} ×</button>)}</div>
        </section>}
        {tab==="seats"&&<>
          <section className="cm-current">
            <div><h3>Current Configuration</h3>
              <div className="cm-current-grid">
                <span><small>BUS TYPE</small><b>{draft.busType}</b></span>
                <span><small>LAYOUT</small><b>{draft.pattern}</b></span>
                <span><small>SEATERS</small><b>{counts.seaters}</b></span>
                <span><small>SEMI-SLEEPERS</small><b>0</b></span>
                <span><small>SLEEPERS</small><b>{counts.sleepers}</b></span>
                <span><small>TOTAL SEATS</small><b>{counts.total}</b></span>
              </div>
            </div>
            <button type="button" disabled={locked} className="cm-gradient-button"
              onClick={generate}>Generate Layout</button>
          </section>
          <div className="cm-legend" aria-label="Seat editor legend">
            {["Available","Male (Booked)","Female (Booked)","Blocked","No-show","Selected"]
              .map((status,i)=><span key={status}><i className={"cm-legend-chip cm-color-"+i}/>{status}</span>)}
          </div>
          <CoachDiagram draft={draft}/>
          <section className="cm-seat-config">
            <header className="cm-seat-config-header">
              <div><h3>Seat Configuration <span>({counts.total} Total seats)</span></h3>
                <p>Search and edit display names without changing passenger ticket seat IDs</p></div>
              <div className="cm-seat-actions">
                <label className="cm-search"><CoachIcon kind="search"/>
                  <input aria-label="Search coach seats" value={search}
                    onChange={e=>setSearch(e.target.value)} placeholder="Search by seat ID or type…"/></label>
                <button disabled={locked} type="button" onClick={()=>setShowAdd(!showAdd)}>+ Add Seat</button>
                <button type="button" className="cm-outline" onClick={resetNames}>Reset Names</button>
              </div>
            </header>
            {showAdd&&!locked&&<form className="cm-add-seat" onSubmit={e=>{e.preventDefault();add();}}>
              <label>Seat ID<input aria-label="New seat ID" required maxLength={24}
                value={seatCode} onChange={e=>setSeatCode(e.target.value)}/></label>
              <label>Deck<select aria-label="New seat deck" value={seatDeck}
                onChange={e=>setSeatDeck(e.target.value as Deck)}>
                <option value="LOWER">Lower</option>
                {draft.pattern==="2+1"&&<option value="UPPER">Upper</option>}</select></label>
              <label>Type<select aria-label="New seat type" value={seatKind}
                onChange={e=>setSeatKind(e.target.value as SeatKind)}>
                <option value="seater">Seater</option>
                {draft.pattern==="2+1"&&<option value="sleeper">Sleeper</option>}
              </select></label>
              <button type="submit" className="cm-gradient-button">Add Seat</button>
              <button type="button" className="cm-outline" onClick={()=>setShowAdd(false)}>Cancel</button>
            </form>}
            <div className="cm-tip">Edit Display Name to update the seat layout immediately. Seat IDs remain unchanged for existing booking, fares and inventory. Physical changes require an unassigned coach.</div>
            <div className="cm-table-scroll">
              <table className="cm-seat-table"><thead><tr>
                <th>#</th><th>Display Name (Editable)</th><th>Type</th><th>Deck</th>
                <th>Orientation</th><th>Position (Grid)</th><th>Actions</th>
              </tr></thead><tbody>
              {coachTable.map((x,i)=><tr key={x.code} data-coach-row={x.code}>
                <td>{i+1}</td>
                <td><input aria-label={"Display name "+x.code} maxLength={48}
                  value={x.label} onChange={e=>setAlias(x.code,x.fixture,e.target.value)}/></td>
                <td><span className={"cm-kind cm-kind-"+x.type.toLowerCase()}>{x.type}</span></td>
                <td>{x.deck==="LOWER"?"Lower":"Upper"}</td>
                <td><span className="cm-orientation">{x.orientation}</span></td>
                <td className="cm-position">{formatPosition(x,x.deck)}</td>
                <td><button type="button" className="cm-trash" disabled={locked}
                  title={"Remove "+x.code} aria-label={"Remove "+x.code}
                  onClick={()=>removeItem(x.code,x.fixture)}><CoachIcon kind="trash"/></button></td>
              </tr>)}
              {!coachTable.length&&<tr><td colSpan={7} className="cm-empty">No seats match this search.</td></tr>}
              </tbody></table>
            </div>
          </section>
        </>}
      </div>
      <footer className="cm-footer">
        <span>{locked?"Assigned coach: structural edits are protected":"Changes remain a local draft until you save."}</span>
        <button className="cm-cancel" type="button" onClick={onClose}>Cancel</button>
        <button className="cm-submit" type="button" disabled={saving} onClick={()=>void save()}>
          <CoachIcon kind="check"/>{saving?"Saving…":id?"Update Coach":"Create Coach"}</button>
      </footer>
    </section>
  </div>;
}
export function CoachesPanel(){
  const [list,setList]=useState<CoachListItem[]>([]);
  const [search,setSearch]=useState("");
  const [layout,setLayout]=useState("all");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editor,setEditor]=useState<FullCoach|CoachDraft|null>(null);
  const load=async()=>{setList(await api.coachInventory());};
  useEffect(()=>{let mounted=true;api.coachInventory().then(x=>{if(mounted)setList(x);})
    .catch(e=>{if(mounted)setError(errorText(e));});
    return ()=>{mounted=false;};},[]);
  const visible=list.filter(c=>(layout==="all"||c.pattern===layout)&&
    [c.name,c.busType,c.pattern,String(c.id)].some(s=>s.toLowerCase().includes(search.toLowerCase())));
  const edit=async(id:number)=>{
    setBusy(true);setError("");
    try{setEditor(await api.coachFull(id));}catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  };
  const save=async(d:CoachDraft,id?:number)=>{
    const result=await api.saveCoach(d,id);
    await load();
    setEditor(null);setNotice("Coach "+result.id+" saved to PostgreSQL. Verified seat codes and layout retained.");
  };
  return <section className="cm-page" data-testid="coaches-page">
    <header className="cm-page-head"><div><small>VEHICLES / COACHES</small>
      <h1>Coaches</h1><p>Coach types, facilities, lower/upper deck layouts and protected seat identities</p></div>
      <div><button type="button" onClick={()=>setEditor(buildReferenceCoach("2+1"))}>+ Add 2+1 Coach</button>
        <button type="button" onClick={()=>setEditor(buildReferenceCoach("2+2"))}>+ Add 2+2 Coach</button></div>
    </header>
    {error&&<div className="cm-alert" role="alert">{error}</div>}
    {notice&&<div className="cm-notice" role="status">{notice}</div>}
    <div className="cm-filters">
      <label>Search Coaches<input value={search} aria-label="Search coaches"
        onChange={e=>setSearch(e.target.value)} placeholder="Search by coach name, type or ID…"/></label>
      <label>Layout<select value={layout} aria-label="Coach layout filter"
        onChange={e=>setLayout(e.target.value)}><option value="all">All Layouts</option>
        <option>2+1</option><option>2+2</option></select></label>
      <span>{visible.length} coaches</span>
    </div>
    <div className="cm-coach-cards">
      {visible.map(c=><article key={c.id} className="cm-card">
        <div className="cm-card-icon"><CoachIcon kind="bus"/></div>
        <div className="cm-card-info"><h3>{c.name}</h3>
          <span>{c.busType} · {c.pattern} · {c.isAc?"A/C":"Non-A/C"}</span>
          <div className="cm-card-metrics"><b>{c.seatCount} seats</b>
            <span>{c.seaterCount} Seater</span><span>{c.sleeperCount} Sleeper</span></div>
          {(c.vehicles>0||c.routes>0)&&<small className="cm-card-assigned">
            Protected: {c.vehicles} vehicles · {c.routes} routes</small>}
        </div>
        <button disabled={busy} type="button" aria-label={"Edit coach "+c.name}
          onClick={()=>void edit(c.id)}>Edit Coach</button>
      </article>)}
      {!visible.length&&<div className="cm-no-results">No coach templates match your filters.</div>}
    </div>
    {editor&&<CoachEditor original={editor} onClose={()=>setEditor(null)} onSave={save}/>}
  </section>;
}
