import { useEffect, useMemo, useState } from "react";
import { api, type CoachOption, type CoachDraft, type CoachSeatDraft, type CoachFixtureDraft, type FullCoach } from "../../api";
import { availableAmenities, cellAt, coachErrors, emptyCoach, fixtureKinds, generateRows,
  layoutMetrics, nextSeatCode, type Deck, type SelectedElement } from "./coachModel";
import "./coaches.css";

const failure = (e: unknown) => e instanceof Error ? e.message : String(e);
type Mode = "select" | "seat" | "fixture";
const cloneDraft = (f: CoachDraft): CoachDraft => ({
  name:f.name,busType:f.busType,pattern:f.pattern,isAc:f.isAc,amenities:[...f.amenities],
  seats:f.seats.map(x=>({...x})),fixtures:f.fixtures.map(x=>({...x}))
});
const fixtureName = (kind: string) => kind.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
const allDecks: Deck[] = ["LOWER","UPPER"];

export function CoachEditorPanel() {
  const [items, setItems] = useState<CoachOption[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CoachDraft>();
  const [existingId, setExistingId] = useState<number>();
  const [locked, setLocked] = useState(false);
  const [usage, setUsage] = useState({routes:0,vehicles:0});
  const [deck, setDeck] = useState<Deck>("LOWER");
  const [mode, setMode] = useState<Mode>("select");
  const [newSeatType, setNewSeatType] = useState<CoachSeatDraft["seatType"]>("seater");
  const [newFixtureType, setNewFixtureType] = useState<CoachFixtureDraft["kind"]>("emergency_exit");
  const [selected, setSelected] = useState<SelectedElement>();
  const [dragged, setDragged] = useState<SelectedElement>();
  const [rowsToGenerate, setRowsToGenerate] = useState(8);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => { setItems(await api.coaches()); };
  useEffect(() => { void refresh().catch(e=>setError(failure(e))); }, []);
  const filtered = useMemo(()=>items.filter(x =>
    [x.name,x.busType,x.pattern].some(t=>t.toLowerCase().includes(query.toLowerCase()))),[items,query]);
  const metrics = draft ? layoutMetrics(draft) : undefined;
  const validation = draft ? coachErrors(draft) : [];
  const edit = (mutate: (current: CoachDraft)=>CoachDraft) => {
    if (locked) return;
    setDraft(prev=>prev?mutate(prev):prev);setDirty(true);setNotice("");setError("");
  };
  const resetInspect=()=>{setSelected(undefined);setMode("select");setDragged(undefined);};
  const confirmDiscard = () => !dirty || window.confirm("Discard unsaved coach changes?");
  const open = async (id: number) => {
    if (!confirmDiscard()) return;
    setLoading(true);setNotice("");setError("");
    try {
      const detail:FullCoach = await api.coachFull(id);
      setDraft(cloneDraft(detail));setExistingId(id);setLocked(detail.structuralLocked);
      setUsage({routes:detail.routeReferences,vehicles:detail.vehicleReferences});
      setDeck("LOWER");setDirty(false);resetInspect();
    } catch(e) {setError(failure(e));}
    finally {setLoading(false);}
  };
  const create = () => {
    if (!confirmDiscard()) return;
    setDraft(emptyCoach());setExistingId(undefined);setLocked(false);setUsage({routes:0,vehicles:0});
    setDeck("LOWER");setDirty(true);resetInspect();setError("");setNotice("New editable coach. Review the generated starter geometry before saving.");
  };
  const clone = async () => {
    if (existingId==null || !confirmDiscard()) return;
    setLoading(true);setError("");
    try {
      const r = await api.cloneCoach(existingId);await refresh();
      setDirty(false);await open(r.id);setNotice("New independent coach version created. Existing routes remain unchanged.");
    }catch(e){setError(failure(e));}
    finally{setLoading(false);}
  };
  const save = async () => {
    if (!draft || locked || validation.length) return;
    setLoading(true);setError("");setNotice("");
    try {
      const prepared:CoachDraft = {...draft,name:draft.name.trim(),busType:draft.busType.trim(),
        seats:draft.seats.map(s=>({...s,code:s.code.trim().toUpperCase()})),
        fixtures:draft.fixtures.map(f=>({...f,label:f.label.trim()}))};
      const result=await api.saveCoach(prepared,existingId);
      const full=await api.coachFull(result.id);
      await refresh();
      setDraft(cloneDraft(full));setExistingId(result.id);setLocked(full.structuralLocked);
      setUsage({routes:full.routeReferences,vehicles:full.vehicleReferences});
      setDirty(false);resetInspect();
      setNotice("Coach geometry, seat IDs and non-bookable fixtures saved to the GDS.");
    }catch(e){setError(failure(e));}
    finally{setLoading(false);}
  };
  const remove = async () => {
    if (existingId==null || locked || !window.confirm("Delete this UNUSED coach permanently? Historical referenced coaches cannot be deleted.")) return;
    setLoading(true);setError("");
    try{await api.deleteCoach(existingId);await refresh();setDraft(undefined);setExistingId(undefined);
      setDirty(false);setNotice("Unused coach deleted.");}
    catch(e){setError(failure(e));}
    finally{setLoading(false);}
  };
  const picked = selected && draft ? selected.kind === "seat" ? draft.seats[selected.index] : draft.fixtures[selected.index] : undefined;
  const updatePicked = (patch: Record<string, unknown>)=>{
    if (!draft || !selected) return;
    if (selected.kind === "seat") edit(d=>({...d,seats:d.seats.map((s,i)=>i===selected.index?{...s,...patch}:s)}));
    else edit(d=>({...d,fixtures:d.fixtures.map((f,i)=>i===selected.index?{...f,...patch}:f)}));
  };
  const removePicked = ()=>{
    if (!draft || !selected || locked) return;
    if (selected.kind === "seat") edit(d=>({...d,seats:d.seats.filter((_,i)=>i!==selected.index)}));
    else edit(d=>({...d,fixtures:d.fixtures.filter((_,i)=>i!==selected.index)}));
    setSelected(undefined);
  };
  const onCell = (row: number,col: number) => {
    if (!draft) return;
    const hit = cellAt(draft,deck,row,col);
    if (hit) {setSelected(hit);setMode("select");return;}
    if (locked || mode === "select") {setSelected(undefined);return;}
    if (mode === "seat") {
      const code = nextSeatCode(draft,deck,newSeatType);
      const seat:CoachSeatDraft={code,deck,row,col,width:1,length:1,
        seatType:newSeatType,isWindow:col===0||col===7};
      edit(d=>({...d,seats:[...d.seats,seat]}));
      setSelected({kind:"seat",index:draft.seats.length});
    }else {
      const f:CoachFixtureDraft={kind:newFixtureType,label:fixtureName(newFixtureType),
        deck,row,col,width:1,length:1};
      edit(d=>({...d,fixtures:[...d.fixtures,f]}));
      setSelected({kind:"fixture",index:draft.fixtures.length});
    }
  };
  const onMove = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draft || !dragged || locked) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const col=Math.max(0,Math.min(7,Math.floor((e.clientX-rect.left)*8/rect.width)));
    const row=Math.max(0,Math.min(29,Math.floor((e.clientY-rect.top)/50)));
    setSelected(dragged);
    if (dragged.kind === "seat") edit(d=>({...d,seats:d.seats.map((s,i)=>i===dragged.index?{...s,deck,row,col}:s)}));
    else edit(d=>({...d,fixtures:d.fixtures.map((f,i)=>i===dragged.index?{...f,deck,row,col}:f)}));
    setDragged(undefined);
  };
  const regenerate=()=>{
    if (!draft || locked) return;
    if (!window.confirm("Regenerate the "+deck+" seats? This replaces ALL seats and fixtures on this deck only."))return;
    try{
      edit(d=>generateRows(d,deck,rowsToGenerate,newSeatType));setSelected(undefined);
    }catch(e){setError(failure(e));}
  };
  const visibleRows=Math.min(30,Math.max(10,...(draft?.seats.filter(s=>s.deck===deck)
    .map(s=>s.row+s.length+1)??[0]),...(draft?.fixtures.filter(f=>f.deck===deck)
    .map(f=>f.row+f.length+1)??[0])));

  return <section className="coach-page" data-testid="coach-editor-page">
    <div className="coach-heading"><div><h2>Coaches & Layout Editor</h2>
      <p className="muted">Design seat inventory and physical cabin fixtures; referenced coach versions remain immutable.</p></div>
      <button type="button" onClick={create} disabled={loading}>+ New Coach</button></div>
    <div className="coach-layout">
      <aside className="coach-list">
        <label>Find coach<input aria-label="Find coach" placeholder="Name or type" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="coach-list-items">
          {filtered.map(c=><button className={"coach-list-item"+(existingId===c.id?" active":"")} type="button" key={c.id}
            onClick={()=>void open(c.id)} aria-label={"Open coach "+c.name}>
            <strong>{c.name}</strong><span>{c.pattern} · {c.busType}</span>
            <small>{c.seatCount} seats · {c.seaterCount} seater · {c.sleeperCount} sleeper</small></button>)}
          {filtered.length===0&&<p className="muted">No matching coaches.</p>}
        </div>
      </aside>
      <div className="coach-workspace">
        {loading&&<p role="status">Working with coach layout…</p>}
        {error&&<p role="alert" className="error">{error}</p>}
        {notice&&<p role="status" className="note">{notice}</p>}
        {!draft&&<div className="coach-empty">Choose a coach to inspect its real seat geometry, or create a new coach.</div>}
        {draft&&<>
          <div className="coach-toolbar">
            <div><strong>{existingId?"Coach #"+existingId:"New coach draft"}</strong>
              <span className="muted">{dirty?" · Unsaved changes":" · Up to date"}</span></div>
            <div className="coach-actions">
              {existingId!=null&&<button className="link" type="button" disabled={loading||dirty} onClick={()=>void clone()}>Clone version</button>}
              <button type="button" disabled={loading||locked||!dirty||validation.length>0} onClick={()=>void save()}>Save Coach</button>
              {existingId!=null&&<button className="link danger" type="button" disabled={loading||locked} onClick={()=>void remove()}>Delete unused</button>}
            </div>
          </div>
          {locked&&<div className="banner warn" data-testid="coach-locked"><strong>Read-only layout.</strong> Linked to {usage.routes} route(s) and {usage.vehicles} vehicle(s).
            Clone this version before changing seat codes or positions.</div>}
          <div className="coach-fields">
            <label>Coach name<input aria-label="Coach name" disabled={locked} value={draft.name} maxLength={100}
              onChange={e=>edit(d=>({...d,name:e.target.value}))}/></label>
            <label>Bus type<input aria-label="Bus type" disabled={locked} value={draft.busType} maxLength={80}
              onChange={e=>edit(d=>({...d,busType:e.target.value}))}/></label>
            <label>Row pattern<select aria-label="Coach pattern" disabled={locked} value={draft.pattern}
              onChange={e=>edit(d=>({...d,pattern:e.target.value as CoachDraft["pattern"]}))}>
              <option value="2+1">2 + 1</option><option value="2+2">2 + 2</option></select></label>
            <label className="coach-check"><input type="checkbox" disabled={locked} checked={draft.isAc}
              onChange={e=>edit(d=>({...d,isAc:e.target.checked}))}/> Air conditioned</label>
          </div>
          <fieldset className="coach-amenities" disabled={locked}><legend>Amenities (declared, not live-verified)</legend>
            {availableAmenities.map(a=><label key={a}><input type="checkbox" checked={draft.amenities.includes(a)}
              onChange={e=>edit(d=>({...d,amenities:e.target.checked?[...d.amenities,a]:d.amenities.filter(x=>x!==a)}))}/>
              {fixtureName(a)}</label>)}</fieldset>
          <div className="coach-metrics">
            {metrics&&([
              ["Bookable seats",metrics.seatCount],["Seaters",metrics.seaters],["Sleepers",metrics.sleepers],
              ["Lower",metrics.lower],["Upper",metrics.upper],["Physical fixtures",metrics.nonBookable]
            ] as const).map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}
          </div>
          <div className="coach-editor-main">
            <div className="coach-visual">
              <div className="coach-deck-bar"><nav aria-label="Coach decks">
                {allDecks.map(d=><button key={d} type="button" className={deck===d?"active":"link"}
                  aria-current={deck===d?"page":undefined} onClick={()=>{setDeck(d);setSelected(undefined);}}>
                  {d==="LOWER"?"Lower Deck":"Upper Deck"}</button>)}</nav>
                <span className="muted">{draft.pattern} · {draft.seats.filter(s=>s.deck===deck).length} bookable seats</span>
              </div>
              <div className="coach-mode-bar">
                <button type="button" aria-current={mode==="select"?"true":undefined} className={mode==="select"?"active":"link"}
                  onClick={()=>setMode("select")}>Select / Move</button>
                <button type="button" disabled={locked} aria-current={mode==="seat"?"true":undefined}
                  className={mode==="seat"?"active":"link"} onClick={()=>setMode("seat")}>+ Seat</button>
                <button type="button" disabled={locked} aria-current={mode==="fixture"?"true":undefined}
                  className={mode==="fixture"?"active":"link"} onClick={()=>setMode("fixture")}>+ Fixture</button>
              </div>
              <div className="coach-generator">
                <label>Rows<input aria-label="Rows to generate" type="number" min="1" max={newSeatType==="sleeper"?14:29}
                  value={rowsToGenerate} disabled={locked} onChange={e=>setRowsToGenerate(Number(e.target.value))}/></label>
                <label>Seat type<select aria-label="Generated seat type" disabled={locked} value={newSeatType}
                  onChange={e=>setNewSeatType(e.target.value as CoachSeatDraft["seatType"])}>
                  <option value="seater">Seater</option><option value="sleeper">Sleeper</option></select></label>
                <button type="button" disabled={locked} onClick={regenerate}>Generate this deck</button>
                {mode==="fixture"&&<label>Fixture<select aria-label="New fixture type" disabled={locked} value={newFixtureType}
                  onChange={e=>setNewFixtureType(e.target.value as CoachFixtureDraft["kind"])}>
                  {fixtureKinds.map(x=><option key={x} value={x}>{fixtureName(x)}</option>)}</select></label>}
              </div>
              <div className="coach-cabin-header">
                <span>Front of bus</span><span aria-hidden="true">◉ Steering wheel</span>
              </div>
              <div className="coach-grid-outer"><div className="coach-grid" aria-label={deck+" physical coach layout"}
                style={{height:visibleRows*50}} onDragOver={e=>e.preventDefault()} onDrop={onMove}>
                {Array.from({length:visibleRows*8},(_,i)=>{
                  const row=Math.floor(i/8),col=i%8,hit=cellAt(draft,deck,row,col);
                  return <button key={i} className="coach-grid-cell" type="button"
                    aria-label={(hit?"Occupied":"Empty")+" row "+(row+1)+" column "+(col+1)}
                    style={{left:col*12.5+"%",top:row*50,width:"12.5%",height:50}}
                    onClick={()=>onCell(row,col)} disabled={Boolean(locked&& !hit)}>{!hit&&mode!=="select"&&!locked?"+":""}</button>;
                })}
                {draft.seats.map((s,i)=>s.deck===deck&&<button key={"s"+i} type="button" draggable={!locked}
                  onDragStart={()=>setDragged({kind:"seat",index:i})}
                  onClick={()=>{setSelected({kind:"seat",index:i});setMode("select");}}
                  className={"coach-element coach-seat "+s.seatType+(selected?.kind==="seat"&&selected.index===i?" chosen":"")}
                  aria-label={"Seat "+s.code} title={s.code+" · "+s.seatType}
                  style={{left:s.col*12.5+"%",top:s.row*50,width:s.width*12.5+"%",height:s.length*50}}>
                  <span>{s.code}</span><small>{s.seatType==="sleeper"?"Sleeper":"Seat"}</small></button>)}
                {draft.fixtures.map((f,i)=>f.deck===deck&&<button key={"f"+i} type="button" draggable={!locked}
                  onDragStart={()=>setDragged({kind:"fixture",index:i})}
                  onClick={()=>{setSelected({kind:"fixture",index:i});setMode("select");}}
                  className={"coach-element coach-fixture"+(selected?.kind==="fixture"&&selected.index===i?" chosen":"")}
                  aria-label={f.label} title={f.kind}
                  style={{left:f.col*12.5+"%",top:f.row*50,width:f.width*12.5+"%",height:f.length*50}}>
                  <span>{f.label}</span></button>)}
              </div></div>
              <p className="muted coach-help">The grid shows 8 columns. Click an empty position to add an item, select an item to edit details,
                or drag it to move. The aisle is represented by unused cells. Fixtures never count as bookable seats.</p>
            </div>
            <aside className="coach-inspector">
              <h3>Layout Inspector</h3>
              {!picked&&<p className="muted">Select a seat or non-bookable fixture to view or edit its exact dimensions and position.</p>}
              {picked&&<div className="coach-property-fields">
                {selected?.kind==="seat"?<>
                  <label>Seat code<input aria-label="Selected seat code" disabled={locked} maxLength={12}
                    value={(picked as CoachSeatDraft).code} onChange={e=>updatePicked({code:e.target.value})}/></label>
                  <label>Seat type<select aria-label="Selected seat type" disabled={locked}
                    value={(picked as CoachSeatDraft).seatType} onChange={e=>updatePicked({seatType:e.target.value})}>
                    <option value="seater">Seater</option><option value="sleeper">Sleeper</option></select></label>
                  <label className="coach-check"><input type="checkbox" disabled={locked}
                    checked={(picked as CoachSeatDraft).isWindow}
                    onChange={e=>updatePicked({isWindow:e.target.checked})}/> Window seat</label>
                </>:<>
                  <label>Fixture type<select aria-label="Selected fixture type" disabled={locked}
                    value={(picked as CoachFixtureDraft).kind} onChange={e=>updatePicked({kind:e.target.value})}>
                    {fixtureKinds.map(x=><option key={x} value={x}>{fixtureName(x)}</option>)}</select></label>
                  <label>Fixture label<input aria-label="Selected fixture label" maxLength={60} disabled={locked}
                    value={(picked as CoachFixtureDraft).label} onChange={e=>updatePicked({label:e.target.value})}/></label>
                </>}
                <label>Deck<select aria-label="Selected deck" disabled={locked} value={picked.deck} onChange={e=>updatePicked({deck:e.target.value})}>
                  {allDecks.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
                {(["row","col","width","length"] as const).map(k=><label key={k}>{({row:"Row (zero-based)",col:"Column (zero-based)",width:"Width (grid cells)",length:"Length (grid cells)"} as const)[k]}
                  <input aria-label={"Selected "+k} disabled={locked} type="number" min={k==="width"||k==="length"?1:0}
                    max={k==="col"?7:k==="row"?29:3} value={picked[k]}
                    onChange={e=>updatePicked({[k]:Number(e.target.value)})}/></label>)}
                <button type="button" className="danger" disabled={locked} onClick={removePicked}>Remove selected item</button>
              </div>}
              <h3>Geometry checks</h3>
              {validation.length? <ul className="coach-validation" role="alert">{validation.slice(0,12).map((x,i)=><li key={i}>{x}</li>)}</ul>
                : <p role="status" className="coach-valid">No seat-code or geometry conflicts detected.</p>}
              <p className="muted">Backend validation runs again on save; existing route, booking and vehicle references cannot be overwritten.</p>
            </aside>
          </div>
        </>}
      </div>
    </div>
  </section>;
}
