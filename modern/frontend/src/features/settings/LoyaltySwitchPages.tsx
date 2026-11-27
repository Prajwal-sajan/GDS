import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api";
import { toast } from "../../components/ui/feedback";

// Settings → Loyalty Program and Switch User (legacy loyalty-switch-v34 layout; lv34-* / su34-* classes).
// Data: GET/PUT /settings/loyalty-v34/{section}; POST /auth/switch-user/v34/resolve (view-as is sent as X-View-As, see api.ts).

const SHAPES: Record<string, ReactNode> = {
  spark: <path d="m12 2 2.2 7.3L21 12l-6.8 2.7L12 22l-2.2-7.3L3 12l6.8-2.7L12 2zM19 2v4m-2-2h4" />,
  gift: <><rect x="3" y="9" width="18" height="12" rx="2" /><path d="M12 9v12M3 13h18M12 9H6a3 3 0 1 1 3-3c1 2 3 3 3 3Zm0 0h6a3 3 0 1 0-3-3c-1 2-3 3-3 3Z" /></>,
  upgrade: <path d="m6 19 5-5-5-5M12 18h9M12 14h9M12 10h9M3 4v13" />,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M12 12a7 7 0 1 1-7 7M7 6h2a2 2 0 0 1 0 4H7m2 0 2 2" /></>,
  percent: <><path d="M5 19 19 5" /><circle cx="6.5" cy="6.5" r="2" /><circle cx="17.5" cy="17.5" r="2" /></>,
  crown: <path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7z" />, medal: <><circle cx="12" cy="8" r="5" /><path d="m8 12-2 9 6-4 6 4-2-9" /></>,
  diamond: <path d="M4 9 8 3h8l4 6-8 13L4 9zM4 9h16M8 3l4 19L16 3" />, award: <><circle cx="12" cy="8" r="5" /><path d="m8 12-1 9 5-3 5 3-1-9" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M7 2v4m10-4v4M3 9h18M9 13h6m-6 3h6" /></>,
  save: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v6h8V3M7 21v-9h10v9" /></>, play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8z" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />, back: <path d="m15 18-6-6 6-6M9 12h13" />,
  person: <><circle cx="10" cy="8" r="4" /><path d="M3 22v-2a7 7 0 0 1 14 0v2M19 8h3m-1.5-1.5v3" /></>,
  close: <path d="M5 5 19 19M19 5 5 19" />, trash: <path d="M4 7h16M10 7V4h4v3M6 7l1 14h10l1-14M10 11v6m4-6v6" />,
};
const Ico = ({ k }: { k: string }) => <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{SHAPES[k]}</svg>;
const Badge = ({ k, color = "orange" }: { k: string; color?: string }) => <span className={`lv34-icon lv34-${color}`}><Ico k={k} /></span>;

interface General { is_active: boolean; miles_to_rupee_ratio: number; max_discount_percent: number; min_redeemable_miles: number; min_booking_amount: number }
interface LoyaltyConfig {
  general: General; seat_upgrades: { enabled: boolean }; daily_limits: { day_of_week: number; redemption_rate: number }[];
  tier_bonus: { tier_name: string; multiplier: number }[]; blocked_dates: { date: string; rate: number; reason?: string }[];
}
type Section = "general" | "seat_upgrades" | "daily_limits" | "tier_bonus" | "blocked_dates";
type Notice = { text: string; tone: "ok" | "error" | "info" };
const DAYS: [string, number][] = [["MON", 1], ["TUE", 2], ["WED", 3], ["THU", 4], ["FRI", 5], ["SAT", 6], ["SUN", 0]];
const TIERS: [string, string, string][] = [["Bronze", "medal", "1"], ["Gold", "crown", "1.2"], ["Platinum", "diamond", "1.5"], ["Silver", "award", "1.1"]];
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Panel({ section, title, description, icon, onSave, busy, notice, children }: { section: Section; title: string; description?: string; icon: string; onSave?: () => void; busy?: boolean; notice?: Notice; children: ReactNode }) {
  return (
    <section className="lv34-panel" data-lv34-panel={section}>
      <header className="lv34-panel-head"><Badge k={icon} color={section} /><div className="lv34-panel-caption"><h2>{title}</h2>{description && <p>{description}</p>}</div>
        {onSave && <button type="button" className="lv34-save" disabled={busy} onClick={onSave}><Ico k="save" /> Save</button>}</header>
      <div className="lv34-panel-body">{children}<div className="lv34-notice" aria-live="polite" role="status" hidden={!notice} data-tone={notice?.tone}>{notice?.text}</div></div>
    </section>
  );
}
const Label = ({ text }: { text: string }) => <label className="lv34-field-label"><span className="lv34-dot"></span>{text}</label>;
function NumField({ name, title, value, onChange, prefix, suffix, step = "any" }: { name: string; title: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; step?: string }) {
  const id = `lv34-${name}`;
  return (
    <div className="lv34-field"><label htmlFor={id}><Label text={title} /></label>
      <div className="lv34-input-shell">{prefix && <span className="lv34-unit lv34-prefix">{prefix}</span>}
        <input id={id} name={name} type="number" min={0} step={step} value={value} required onChange={(e) => onChange(e.currentTarget.value)} />
        {suffix && <span className="lv34-unit lv34-suffix">{suffix}</span>}</div></div>
  );
}

export function LoyaltyProgramPage() {
  const [cfg, setCfg] = useState<LoyaltyConfig>();
  const [error, setError] = useState<string>();
  const [gen, setGen] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<number, string>>({});
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [block, setBlock] = useState({ date: "", rate: "0", reason: "" });
  const [notices, setNotices] = useState<Partial<Record<Section, Notice>>>({});
  const [busy, setBusy] = useState<Section | null>(null);
  const [how, setHow] = useState(false);
  const howBtn = useRef<HTMLButtonElement>(null);

  const apply = (c: LoyaltyConfig) => {
    setCfg(c);
    setGen({ miles_to_rupee_ratio: String(c.general.miles_to_rupee_ratio), max_discount_percent: String(c.general.max_discount_percent), min_redeemable_miles: String(c.general.min_redeemable_miles), min_booking_amount: String(c.general.min_booking_amount) });
    setDays(Object.fromEntries(DAYS.map(([, i]) => [i, String(c.daily_limits.find((v) => v.day_of_week === i)?.redemption_rate ?? 0)])));
    setTiers(Object.fromEntries(TIERS.map(([n]) => [n, String(c.tier_bonus.find((x) => x.tier_name === n)?.multiplier ?? 1)])));
  };
  const load = useCallback(async () => {
    try { apply(await api.admin<LoyaltyConfig>("/settings/loyalty-v34")); setError(undefined); } catch (e) { setError(msgOf(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!how) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setHow(false); howBtn.current?.focus(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [how]);

  const save = async (section: Section, value: unknown) => {
    setBusy(section);
    try {
      const r = await api.admin<{ configuration: LoyaltyConfig }>(`/settings/loyalty-v34/${section}`, "PUT", { value });
      apply(r.configuration);
      setNotices((n) => ({ ...n, [section]: { text: "Saved successfully.", tone: "ok" } }));
      toast(`Loyalty ${section.replace(/_/g, " ")} saved`, "ok");
      return true;
    } catch (e) { setNotices((n) => ({ ...n, [section]: { text: msgOf(e), tone: "error" } })); return false; }
    finally { setBusy(null); }
  };
  const validPanel = (section: Section) => {
    const bad = document.querySelector<HTMLInputElement>(`[data-lv34-panel="${section}"] input:invalid`);
    if (bad) { bad.reportValidity(); return false; }
    return true;
  };

  if (error) return <div className="lv34-error">Unable to load Loyalty Program: {error} <button type="button" onClick={() => void load()}>Retry</button></div>;
  if (!cfg) return <div className="lv34-container"><div className="empty">Loading…</div></div>;

  const enabled = cfg.general.is_active, upgrades = cfg.seat_upgrades.enabled;
  const Toggle = ({ on, label, onClick, section }: { on: boolean; label: string; onClick: () => void; section: Section }) => (
    <button className={`lv34-toggle ${on ? "lv34-on" : ""}`} type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy === section} onClick={onClick}><i></i></button>
  );
  const addBlocked = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    if (cfg.blocked_dates.some((x) => x.date === block.date)) { setNotices((n) => ({ ...n, blocked_dates: { text: "Date already exists. Delete it before adding a replacement.", tone: "error" } })); return; }
    if (await save("blocked_dates", [...cfg.blocked_dates, { date: block.date, rate: Number(block.rate), reason: block.reason.trim() }])) setBlock({ date: "", rate: "0", reason: "" });
  };

  return (
    <div className="lv34-container">
      <div className="lv34-root" data-lv34-root="">
        <header className="lv34-top"><div><Badge k="spark" /><h1>Loyalty Program</h1><button ref={howBtn} className="lv34-how" type="button" onClick={() => setHow(true)}><Ico k="play" /> How to</button></div>
          <span className={`lv34-enabled ${enabled ? "active" : "inactive"}`}><i></i>{enabled ? "Enabled" : "Disabled"}</span></header>
        <main className="lv34-main">
          <section className="lv34-hero">
            <div className="lv34-hero-heading"><Badge k="gift" color="gift" /><div><h2>Loyalty Program</h2><p>Miles, redemption, and seat upgrades — your loyalty toolkit in one place.</p></div>
              <Toggle on={enabled} label="Enable Loyalty Program" section="general" onClick={() => void save("general", { ...cfg.general, is_active: !enabled })} /></div>
            <div className="lv34-stats">
              <div><label>VALUE PER MILE (₹)</label><strong>₹{cfg.general.miles_to_rupee_ratio}</strong><small>/mile</small></div>
              <div><label>MAX DISCOUNT (%)</label><strong>{cfg.general.max_discount_percent}</strong><small> %</small></div>
              <div><label>MINIMUM MILES TO USE</label><strong>{cfg.general.min_redeemable_miles}</strong></div>
            </div>
          </section>
          <section className="lv34-upgrade">
            <div><Badge k="upgrade" color="upgrade" /><div className="lv34-upgrade-copy"><h2>Enable Seat Upgrades</h2><p>Unsold seats in the last 20 minutes before boarding are offered to loyal travelling passengers as a free upgrade.</p></div>
              <Toggle on={upgrades} label="Enable Seat Upgrades" section="seat_upgrades" onClick={() => void save("seat_upgrades", { enabled: !upgrades })} /></div>
            <p className="lv34-footnote">When available: shared → single, upper → lower berth, back → front row.</p>
          </section>

          <Panel section="general" title="General Settings" icon="coins" busy={busy === "general"} notice={notices.general} onSave={() => {
            if (validPanel("general")) void save("general", { is_active: enabled, miles_to_rupee_ratio: Number(gen.miles_to_rupee_ratio), max_discount_percent: Number(gen.max_discount_percent), min_redeemable_miles: Number(gen.min_redeemable_miles), min_booking_amount: Number(gen.min_booking_amount) });
          }}>
            <div className="lv34-general-grid">
              <NumField name="miles_to_rupee_ratio" title="Value per Mile (₹)" prefix="₹" step="0.0001" value={gen.miles_to_rupee_ratio} onChange={(v) => setGen((g) => ({ ...g, miles_to_rupee_ratio: v }))} />
              <NumField name="max_discount_percent" title="Max Discount (%)" suffix="%" step="1" value={gen.max_discount_percent} onChange={(v) => setGen((g) => ({ ...g, max_discount_percent: v }))} />
              <p className="lv34-hint">How much discount 1 mile gives</p><p className="lv34-hint">Maximum % of ticket price that can be discounted</p>
              <NumField name="min_redeemable_miles" title="Minimum Miles to Use" suffix="miles" step="1" value={gen.min_redeemable_miles} onChange={(v) => setGen((g) => ({ ...g, min_redeemable_miles: v }))} />
              <NumField name="min_booking_amount" title="Minimum Booking Amount (₹)" prefix="₹" step="0.01" value={gen.min_booking_amount} onChange={(v) => setGen((g) => ({ ...g, min_booking_amount: v }))} />
            </div>
          </Panel>

          <Panel section="daily_limits" title="Daily Limits" description="% of miles a passenger can use on each day of the week" icon="percent" busy={busy === "daily_limits"} notice={notices.daily_limits}
            onSave={() => { if (validPanel("daily_limits")) void save("daily_limits", DAYS.map(([, i]) => ({ day_of_week: i, redemption_rate: Number(days[i]) }))); }}>
            <div className="lv34-days">{DAYS.map(([day, i]) => (
              <label key={day} className={`lv34-day ${i === 0 || i === 6 ? "weekend" : ""}`}><span>{day}</span>
                <div><input type="number" min={0} max={100} step={1} required aria-label={`${day} daily miles usage limit`} value={days[i] ?? "0"} onChange={(e) => { const v = e.currentTarget.value; setDays((d) => ({ ...d, [i]: v })); }} /><em>%</em></div></label>
            ))}</div>
          </Panel>

          <Panel section="tier_bonus" title="Tier Bonus" description="Loyal passengers get more value per mile (e.g., Gold 1.2x means 100 miles = ₹120)" icon="crown" busy={busy === "tier_bonus"} notice={notices.tier_bonus}
            onSave={() => { if (validPanel("tier_bonus")) void save("tier_bonus", TIERS.map(([n]) => ({ tier_name: n, multiplier: Number(tiers[n]) }))); }}>
            <div className="lv34-tiers">{TIERS.map(([name, icon, def]) => (
              <div key={name} className={`lv34-tier lv34-tier-${name.toLowerCase()}`}><Badge k={icon} color={name.toLowerCase()} /><h3>{name}</h3>
                <div className="lv34-tier-input"><input type="number" min={0} max={10} step={0.001} required aria-label={`${name} multiplier`} value={tiers[name] ?? "1"} onChange={(e) => { const v = e.currentTarget.value; setTiers((t) => ({ ...t, [name]: v })); }} />
                  <button type="button" aria-label={`Reset ${name} multiplier`} onClick={() => setTiers((t) => ({ ...t, [name]: def }))}><Ico k="close" /></button></div></div>
            ))}</div>
          </Panel>

          <Panel section="blocked_dates" title="Blocked Dates" description="Block or reduce miles usage on specific dates (festivals, holidays, peak days)" icon="calendar" notice={notices.blocked_dates}>
            <form className="lv34-block-form" onSubmit={(e) => void addBlocked(e)}>
              <div><label htmlFor="lv34-block-date">Date</label><div className="lv34-date"><span><Ico k="calendar" /></span>
                <input id="lv34-block-date" type="date" name="date" required aria-label="Blocked date" value={block.date} onChange={(e) => { const v = e.currentTarget.value; setBlock((b) => ({ ...b, date: v })); }} /></div></div>
              <div><label htmlFor="lv34-block-rate">Rate %</label><div className="lv34-date lv34-rate-input">
                <input id="lv34-block-rate" type="number" name="rate" min={0} max={100} step={1} required value={block.rate} onChange={(e) => { const v = e.currentTarget.value; setBlock((b) => ({ ...b, rate: v })); }} /><span>%</span></div></div>
              <div><label htmlFor="lv34-block-reason">Reason</label><input id="lv34-block-reason" type="text" name="reason" maxLength={160} placeholder="e.g., Diwali peak" value={block.reason} onChange={(e) => { const v = e.currentTarget.value; setBlock((b) => ({ ...b, reason: v })); }} /></div>
              <button type="submit" className="lv34-block-save" disabled={busy === "blocked_dates"}><Ico k="close" /> Save</button>
            </form>
            <div className="lv34-blocked-list">{cfg.blocked_dates.length ? cfg.blocked_dates.map((x) => (
              <div key={x.date} className="lv34-blocked-row"><div><Ico k="calendar" /> <strong>{x.date}</strong><span className="lv34-rate">{x.rate}%</span>{x.reason && <span className="lv34-reason">{x.reason}</span>}</div>
                <button type="button" aria-label={`Delete blocked date ${x.date}`} disabled={busy === "blocked_dates"}
                  onClick={() => { if (window.confirm(`Remove the blocked-date rule for ${x.date}?`)) void save("blocked_dates", cfg.blocked_dates.filter((b) => b.date !== x.date)); }}><Ico k="trash" /></button></div>
            )) : <p className="lv34-empty">No blocked dates added.</p>}</div>
          </Panel>
        </main>

        <div className="lv34-overlay" hidden={!how} onClick={(e) => { if (e.target === e.currentTarget) { setHow(false); howBtn.current?.focus(); } }}>
          <div className="lv34-dialog" role="dialog" aria-modal="true" aria-labelledby="lv34-how-title">
            <header><h2 id="lv34-how-title">How the Loyalty Program works</h2><button type="button" aria-label="Close instructions" onClick={() => { setHow(false); howBtn.current?.focus(); }}><Ico k="close" /></button></header>
            <p>Passengers earn miles on eligible paid bookings. Redeemed miles reduce the ticket fare within the configured limits.</p>
            <p><b>General Settings:</b> control rupees per mile, maximum ticket discount and minimum eligibility.</p>
            <p><b>Daily Limits:</b> restrict the fraction of a passenger’s available miles redeemable today. Blocked dates further restrict redemption for travel on selected dates.</p>
            <p><b>Tier Bonus:</b> Bronze, Gold, Platinum and Silver multiply the redemption value of each mile.</p>
            <p><b>Seat upgrades:</b> configure the intended free-upgrade feature; automated reassignment requires an authorized inventory/consent workflow.</p>
            <button type="button" className="lv34-save" autoFocus={how} onClick={() => { setHow(false); howBtn.current?.focus(); }}>Got it</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SwitchUserPage() {
  const viewAs = localStorage.getItem("viewAs") || "";
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "error" }>();
  useEffect(() => { document.body.classList.add("su34-active"); return () => document.body.classList.remove("su34-active"); }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      if (viewAs) throw new Error("Return to your own account before choosing another user.");
      const person = await api.admin<{ id?: number; name: string; role: string }>("/auth/switch-user/v34/resolve", "POST", { phone: phone.trim() });
      if (!person.id) throw new Error("Could not verify user");
      localStorage.setItem("viewAs", String(person.id));
      setStatus({ text: `Switching to ${person.name} (${person.role}). Changes will be recorded under your account.`, tone: "ok" });
      window.location.hash = "#/"; window.location.reload();
    } catch (err) { setStatus({ text: msgOf(err) || "Unable to switch users", tone: "error" }); setBusy(false); }
  };
  return (
    <div className="su34-route">
      <div className="su34-page" data-su34-root="">
        <header className="su34-top"><a href="#/settings" aria-label="Back to Settings"><Ico k="back" /></a><span><Ico k="person" /></span><h1>Switch User</h1></header>
        <main className="su34-center">
          <h2>View the app as another user</h2>
          <p>Enter the phone number of a user below your level (driver, pickup manager, agent, ...). You will see the app exactly as they do, but anything you change is still recorded under your own name.</p>
          <form onSubmit={(e) => void submit(e)}>
            <label htmlFor="su34-phone">Phone Number</label>
            <input id="su34-phone" name="phone" type="tel" inputMode="numeric" autoComplete="off" placeholder="e.g. 9876543210" minLength={10} maxLength={10} pattern="[0-9]{10}" required autoFocus
              value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
            <button type="submit" disabled={busy}>Continue <Ico k="arrow" /></button>
          </form>
          <div className="su34-status" role="status" aria-live="polite" hidden={!status} data-tone={status?.tone}>{status?.text}</div>
          {viewAs && <button type="button" className="su34-return" onClick={() => { localStorage.removeItem("viewAs"); window.location.hash = "#/"; window.location.reload(); }}>Return to my account</button>}
        </main>
      </div>
    </div>
  );
}
