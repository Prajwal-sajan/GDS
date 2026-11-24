import "./ModernShell.css";

interface Module { key:string;label:string;roles:string[] }
const paths:Record<string,string>={
 trips:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
 gds:"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
 comms:"M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
 schedules:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
 routes:"M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
 crm:"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
 fleet:"M3 6h18v12H3zM3 14h18M7 18v1.5M17 18v1.5",
 coaches:"M4 4h16v16H4zM7 7h10v10H7zM10 7v10m4-10v10M7 12h10",
 staff:"M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
 ledger:"M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
 reports:"M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
 sarathi:"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
};
function Icon({name}:{name:string}) {
  return <svg className="gds-ico" aria-hidden="true" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]??paths.gds}/></svg>;
}
/** The route/menu order is read from original public/js/main.js TOP + SUB. */
const originalOrder=["schedules","routes","crm","fleet","coaches","ledger","staff","reports","sarathi",
  "dispatch","fares","recon","outbox","redbus","users","comms"];
export function ModernShell({ modules, active, role, user, onNavigate, signOut, children }:{
  modules:Module[];active:string;role:string;user:string;
  onNavigate:(key:string)=>void;signOut:()=>void;children:React.ReactNode
}) {
  const byKey=new Map(modules.map(m=>[m.key,m]));
  const navigation=originalOrder.map(id=>byKey.get(id)).filter((m):m is Module=>Boolean(m));
  const top=[{key:"trips",label:"Trips",go:"trips"},
    {key:"gds",label:"GDS",go:modules.some(x=>x.key==="schedules")?"schedules":modules[0]?.key},
    {key:"comms",label:"Chats",go:modules.some(x=>x.key==="comms")?"comms":"crm"}]
    .filter(x=>x.go&&byKey.has(x.go));
  const activeTop=active==="trips"?"trips":active==="comms"?"comms":"gds";
  return <div className="gds-modern-shell shell">
    <header className="gds-modern-header">
      <div className="gds-modern-brand">
        <span className="gds-modern-mark"><Icon name="fleet"/></span>
        <div><b>JourneyOS</b><small>Bus Operations GDS</small></div>
      </div>
      <nav aria-label="Main navigation" className="gds-modern-primary">
        {top.map(x=><button type="button" key={x.key}
          aria-current={activeTop===x.key?"page":undefined}
          className={"gds-modern-pill"+(activeTop===x.key?" selected":"")}
          onClick={()=>onNavigate(x.go)}>
          <Icon name={x.key}/>{x.label}
        </button>)}
      </nav>
      <span className="gds-modern-user" data-testid="whoami" title={role}>{user} · {role}</span>
      <button type="button" className="gds-modern-signout" onClick={signOut}>Sign out</button>
    </header>
    <div className="gds-modern-subbar">
      <nav aria-label="GDS modules" className="gds-modern-subnav">
        {navigation.map(m=><button type="button" key={m.key}
          aria-current={active===m.key?"page":undefined}
          className={"gds-modern-subpill"+(active===m.key?" selected":"")}
          onClick={()=>onNavigate(m.key)}><Icon name={m.key}/>{m.label}</button>)}
      </nav>
    </div>
    <main className="gds-modern-main">{children}</main>
  </div>;
}