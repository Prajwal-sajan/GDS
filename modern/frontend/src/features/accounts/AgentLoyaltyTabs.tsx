/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api";
import { confirmDialog, Modal, toast, toastError } from "../../components/ui/feedback";
import { NiceSelect } from "../../components/ui/NiceSelect";
import { Empty, fmt, Ic, inr, LedgerDialog, num, Table, type Col } from "./AccountsPage";

// React ports of legacy Accounts → Agent Settings and Loyalty (public/js/accounts-parity-v10.js agentSettings()/renderAgents(),
// agentTermsDialog(), agentEdit(), agentAdd(), loyalty(), couponDialog()). Same DOM / ac10-* classes as legacy.
// Deliberate fixes over legacy (documented in the parity specs): the OTA card's "Tax on Fare" shows tax_on_fare_percent (legacy
// printed the GST-on-commission value) and percentage coupons render as "% off" (legacy only recognised "percent").
const n = (x: unknown) => Number(x) || 0;
const Btn = ({ action, cls = "", children, ...rest }: { action: string; cls?: string; children: ReactNode; [k: string]: unknown }) =>
  <button type="button" className={`ac10-btn ${cls}`} data-ac10={action} {...rest}>{children}</button>;
const Field = ({ label, name, value, type = "text", ...extra }: { label: string; name: string; value: unknown; type?: string; [k: string]: unknown }) =>
  <label className="ac10-field"><span>{label}</span><input name={name} type={type} defaultValue={value == null ? "" : String(value)} {...extra} /></label>;
function Sel({ name, opts, cur }: { name: string; opts: [string, string][]; cur: unknown }) {
  const [v, setV] = useState(String(cur ?? opts[0][0]));
  return <label className="ac10-select ui-dd-hosted"><NiceSelect name={name} value={v} options={opts} onChange={setV} /><Ic k="chevron" s={16} /></label>;
}
const formVal = (f: HTMLFormElement) => {
  const o: Record<string, any> = {};
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    o[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return o;
};
function Dialog({ title, sub, kind, onClose, children }: { title: string; sub: string; kind: string; onClose: () => void; children: ReactNode }) {
  return <Modal size="lg" portal className={`ac10-overlay ${kind}`} onClose={onClose}
    title={<><span className="ac10-modalicon"><Ic k="receivables" s={23} /></span><div className="ac10-modalheading"><b>{title}</b><small>{sub}</small></div></>}>{children}</Modal>;
}
const Buttons = ({ onClose, ok }: { onClose: () => void; ok: string }) =>
  <div className="ac10-modalbuttons"><button type="button" className="ac10-btn subtle" data-close="" onClick={onClose}>Cancel</button><button type="submit" className="ac10-btn primary">{ok}</button></div>;

// ---------------- Agent Settings ----------------
type Dlg = { kind: "ota"; idx: number } | { kind: "agent"; idx: number | null } | { kind: "add-ota" } | { kind: "ledger"; channel: string; type: "credit" | "debit" } | null;
export function AgentSettingsTab() {
  const [d, setD] = useState<{ agents: any[]; configs: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"otas" | "agents">("otas");
  const [dlg, setDlg] = useState<Dlg>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { api.admin<any>("/accounts/agent-settings").then(setD).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); toastError(e); }); }, [reload]);
  if (err) return <div className="ac10-empty error"><Ic k="reports" s={30} /><b>Could not load agent-settings</b><p>{err}</p></div>;
  if (!d) return <div className="ac10-loading">Loading Accounts…</div>;
  const saveConfigs = async (all: any[], msg: string) => { await api.admin("/reconciliation/config", "PUT", all); toast(msg, "ok"); setDlg(null); setReload((x) => x + 1); };
  const toggleOrDelete = async (idx: number, del: boolean) => {
    const r = d.configs[idx]; if (!r) return;
    if (del && !(await confirmDialog(`Delete configuration ${r.ota_display_name || r.ota_slug}?`, { ok: "Delete", danger: true }))) return;
    const all = del ? d.configs.filter((_, i) => i !== idx) : d.configs.map((c, i) => (i === idx ? { ...c, is_active: !c.is_active } : c));
    await saveConfigs(all, "Configuration updated").catch(toastError);
  };
  const otas = d.configs, agents = d.agents;
  return (
    <>
      <div className="ac10-row-between ac10-agenthead">
        <div className="ac10-pills">
          <Btn action="agent-tab" cls={tab === "otas" ? "selected" : ""} data-value="otas" onClick={() => setTab("otas")}>{`OTA Configurations ${otas.length}`}</Btn>
          <Btn action="agent-tab" cls={tab === "agents" ? "selected" : ""} data-value="agents" onClick={() => setTab("agents")}>{`Agent Configurations ${agents.length}`}</Btn>
        </div>
        <Btn action="agent-add" cls="primary" onClick={() => setDlg(tab === "agents" ? { kind: "agent", idx: null } : { kind: "add-ota" })}><Ic k="plus" s={14} />{` ${tab === "otas" ? "Add OTA" : "Add Agent"}`}</Btn>
      </div>
      <div data-agent-list="">
        {tab === "otas" ? (otas.length ? otas.map((r, i) => (
          <div key={r.ota_slug} className="ac10-agentcard">
            <div className="ac10-row-between"><strong>{r.ota_display_name || r.ota_slug}</strong>
              <div className="ac10-tools">
                <span className={`ac10-status ${r.is_active ? "ok" : "bad"}`}>{r.is_active ? "Active" : "Inactive"}</span>
                <button type="button" className={`ac10-switch ${r.is_active ? "on" : ""}`} data-ac10="agent-toggle" data-index={i} aria-label="Toggle OTA configuration" onClick={() => toggleOrDelete(i, false)} />
                <Btn action="agent-edit" cls="outlined" data-index={i} title="Edit" onClick={() => setDlg({ kind: "ota", idx: i })}><Ic k="edit" /></Btn>
                <Btn action="agent-delete" cls="outlined danger" data-index={i} title="Remove" onClick={() => toggleOrDelete(i, true)}><Ic k="trash" /></Btn>
              </div>
            </div>
            <small>{`Code: ${r.ota_slug}`}</small>
            <div className="ac10-agentproperties">
              {([["Commission", `${n(r.commission_percent).toFixed(2)}%`], ["Commission Base", r.commission_base || "Fare only"], ["Tax on Fare", `${n(r.tax_on_fare_percent)}%`],
                ["Tax Receivable", r.tax_receivable_from_ota ? "Yes" : "—"], ["TDS", `${n(r.tds_percent)}%`], ["GST on Comm.", `${n(r.gst_on_commission_percent)}%`], ["Mode", r.settlement_mode || "DOJ"],
                ["Commission kept on passenger cancel", r.commission_kept_on_passenger_cancel ? "Yes" : "No"], ["Tolerance", inr(r.match_tolerance ?? 0)]] as [string, string][])
                .map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
            </div>
            <small>Verifications / matched / issues are available after importing a settlement file.</small>
          </div>
        )) : <Empty text="No OTA configurations" />)
          : (agents.length ? agents.map((r, i) => (
            <div key={r.phone} className="ac10-agentcard">
              <div className="ac10-row-between"><strong>{r.name}</strong>
                <div className="ac10-tools">
                  <span className="ac10-status ok">Agent</span>
                  <Btn action="agent-view" cls="outlined" data-index={i} title="View ledger" onClick={() => setDlg({ kind: "ledger", channel: r.channel_key, type: "credit" })}><Ic k="eye" /></Btn>
                  <Btn action="agent-edit" cls="outlined" data-index={i} title="Edit financial terms" onClick={() => setDlg({ kind: "agent", idx: i })}><Ic k="edit" /></Btn>
                </div>
              </div>
              <small>{`Code: ${r.phone} `}</small>
              <p className="ac10-note">Uses GDS default commission unless an authorized agent-specific configuration is available.</p>
              <div className="ac10-agentproperties">
                <div><small>Commission</small><b>{`${n(r.commission_pct)}%`}</b></div>
                <div><small>Wallet</small><b>Use ledger to inspect</b></div>
                <div><Btn action="ledger-open" cls="green" data-channel={r.channel_key} data-ledtype="credit" onClick={() => setDlg({ kind: "ledger", channel: r.channel_key, type: "credit" })}><Ic k="plus" s={13} />{" Record payment"}</Btn></div>
                <div><Btn action="ledger-open" cls="amber" data-channel={r.channel_key} data-ledtype="debit" onClick={() => setDlg({ kind: "ledger", channel: r.channel_key, type: "debit" })}>Debit / adjustment</Btn></div>
                <div><Btn action="ledger-open" cls="outlined" data-channel={r.channel_key} data-ledtype="credit" onClick={() => setDlg({ kind: "ledger", channel: r.channel_key, type: "credit" })}>Ledger</Btn></div>
              </div>
            </div>
          )) : <Empty text="No agents configured" />)}
      </div>
      {dlg?.kind === "ledger" && <LedgerDialog channel={dlg.channel} type={dlg.type} onClose={() => setDlg(null)} onSaved={() => setDlg(null)} />}
      {dlg?.kind === "ota" && <OtaDialog c={d.configs[dlg.idx]} onClose={() => setDlg(null)}
        onSave={(next) => saveConfigs(d.configs.map((x, j) => (j === dlg.idx ? next : x)), "OTA configuration saved")} />}
      {dlg?.kind === "add-ota" && <AddOtaDialog onClose={() => setDlg(null)} onSave={(v) => {
        if (d.configs.some((x) => x.ota_slug === v.ota_slug)) { toast("OTA exists", "bad"); return Promise.resolve(); }
        return saveConfigs([...d.configs, { ...v, commission_base: "fare_only", settlement_mode: "DOJ", tds_percent: 0.1, gst_on_commission_percent: 18, is_active: true }], "OTA configuration saved");
      }} />}
      {dlg?.kind === "agent" && <AgentTermsDialog r={dlg.idx === null ? null : agents[dlg.idx]} onClose={() => setDlg(null)}
        onSaved={() => { setDlg(null); toast("Agent terms saved", "ok"); setReload((x) => x + 1); }} />}
    </>
  );
}

function OtaDialog({ c, onClose, onSave }: { c: any; onClose: () => void; onSave: (next: any) => Promise<void> }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const vals = formVal(e.currentTarget);
    const next = { ...c, ...vals, tax_receivable_from_ota: String(vals.tax_receivable_from_ota) === "true", commission_kept_on_passenger_cancel: String(vals.commission_kept_on_passenger_cancel) === "true" };
    if (!Number.isFinite(Number(next.commission_percent)) || n(next.commission_percent) < 0) return toast("Invalid commission", "bad");
    onSave(next).catch(toastError);
  };
  const I = (label: string, name: string, value: unknown, type = "text") => <Field label={label} name={name} value={value} type={type} required />;
  return (
    <Dialog title={`Edit ${c.ota_display_name || c.ota_slug}`} sub="OTA financial configuration" kind="ac10-large-modal" onClose={onClose}>
      <form data-otaform="" onSubmit={submit}>
        <div className="ac10-grid-4">
          {I("Operator code", "ota_slug", c.ota_slug)}{I("Commission %", "commission_percent", c.commission_percent, "number")}
          <label className="ac10-field"><span>Commission base</span><Sel name="commission_base" opts={[["fare_only", "Fare Only"], ["fare_plus_gst", "Fare + GST"]]} cur={c.commission_base} /></label>
          {I("Tax on fare %", "tax_on_fare_percent", c.tax_on_fare_percent ?? 0, "number")}{I("GST on commission %", "gst_on_commission_percent", c.gst_on_commission_percent ?? 18, "number")}
          {I("TDS %", "tds_percent", c.tds_percent ?? 0, "number")}{I("Cycle (days)", "settlement_cycle_days", c.settlement_cycle_days ?? 7, "number")}
          <label className="ac10-field"><span>Settlement mode</span><Sel name="settlement_mode" opts={[["DOJ", "DOJ (Date of Journey)"], ["DOB", "DOB (Date of Booking)"]]} cur={c.settlement_mode} /></label>
          {I("TDS section", "tds_section", c.tds_section || "194-O on the sale (fare - offer)")}{I("Match tolerance (INR)", "match_tolerance", c.match_tolerance ?? 1, "number")}
          <label className="ac10-field"><span>Tax receivable from OTA</span><Sel name="tax_receivable_from_ota" opts={[["true", "Yes"], ["false", "No"]]} cur={String(!!c.tax_receivable_from_ota)} /></label>
          <label className="ac10-field"><span>Commission kept on passenger cancel</span><Sel name="commission_kept_on_passenger_cancel" opts={[["true", "Yes"], ["false", "No"]]} cur={String(!!c.commission_kept_on_passenger_cancel)} /></label>
        </div>
        <label className="ac10-checkbox"><input type="checkbox" name="is_active" defaultChecked={!!c.is_active} /> Active</label>
        <Buttons onClose={onClose} ok="Save" />
      </form>
    </Dialog>
  );
}

function AddOtaDialog({ onClose, onSave }: { onClose: () => void; onSave: (v: any) => Promise<void> }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = formVal(e.currentTarget);
    if (!String(v.ota_slug).trim() || !String(v.ota_display_name).trim()) return toast("OTA code and display name are required", "bad");
    onSave({ ...v, ota_slug: String(v.ota_slug).trim().toLowerCase() }).catch(toastError);
  };
  return (
    <Modal title="Add OTA configuration" portal onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fld"><label>OTA code *</label><input name="ota_slug" required /></div>
        <div className="fld"><label>Display name *</label><input name="ota_display_name" required /></div>
        <div className="fld"><label>Commission %</label><input name="commission_percent" type="number" step="0.01" min="0" max="100" defaultValue="0" /></div>
        <div className="fld"><label>Settlement days</label><input name="settlement_cycle_days" type="number" min="0" defaultValue="7" /></div>
        <div className="ft"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">Add OTA</button></div>
      </form>
    </Modal>
  );
}

function AgentTermsDialog({ r, onClose, onSaved }: { r: any | null; onClose: () => void; onSaved: () => void }) {
  const isNew = r === null, a = r ?? { name: "", phone: "", commission_pct: 0 };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = formVal(e.currentTarget);
    if (!String(v.name).trim() || !String(v.phone).trim()) return toast("Enter agent name and phone", "bad");
    if (n(v.commission_pct) > 100 || n(v.commission_pct) < 0) return toast("Commission must be 0–100%", "bad");
    try { await api.admin("/accounts/channels/agents", "PUT", { ...v, is_active: !!v.is_active, independent_commission: !!v.independent_commission }); onSaved(); } catch (err) { toastError(err); }
  };
  return (
    <Dialog title={isNew ? "Add Agent Configuration" : "Edit Agent Configuration"} sub={a.name || "Financial terms"} kind="ac10-large-modal ac10-agent-preview" onClose={onClose}>
      <div className="ac10-backend-note"><Ic k="filter" />{" "}<b>Agent terms</b> — saved to the GDS. Commission applies to new agent bookings; a new phone number creates the agent login.</div>
      <form data-agent-terms-form="" onSubmit={submit}>
        <div className="ac10-grid-4">
          <Field label="Agent name" name="name" value={a.name} required />
          <Field label="Phone / agent code" name="phone" value={a.phone} required readOnly={!isNew} />
          <Field label="Commission %" name="commission_pct" value={a.commission_pct ?? 0} type="number" required min="0" max="100" step="0.01" />
          <Field label="Balance held for agent (₹)" name="balance" value={a.balance ?? 0} type="number" min="0" step="0.01" />
          <Field label="Credit limit (₹)" name="credit_limit" value={a.credit_limit ?? 0} type="number" min="0" step="0.01" />
          <Field label="Payment cycle (days)" name="settlement_cycle_days" value={a.settlement_cycle_days ?? 7} type="number" min="0" />
          <label className="ac10-field"><span>Commission base</span><Sel name="commission_base" opts={[["fare_only", "Fare Only"], ["fare_plus_gst", "Fare + GST"]]} cur={a.commission_base ?? "fare_only"} /></label>
          <label className="ac10-field"><span>Settlement mode</span><Sel name="settlement_mode" opts={[["DOJ", "DOJ (Date of Journey)"], ["DOB", "DOB (Date of Booking)"], ["weekly", "Weekly"]]} cur={a.settlement_mode ?? "DOJ"} /></label>
          <Field label="Tax on fare %" name="tax_on_fare_percent" value={a.tax_on_fare_percent ?? 0} type="number" step="0.01" min="0" />
          <Field label="TDS %" name="tds_percent" value={a.tds_percent ?? 0} type="number" step="0.01" min="0" />
          <Field label="GST on commission %" name="gst_on_commission_percent" value={a.gst_on_commission_percent ?? 18} type="number" step="0.01" min="0" />
          <Field label="Match tolerance (₹)" name="match_tolerance" value={a.match_tolerance ?? 1} type="number" step="0.01" min="0" />
        </div>
        <div className="ac10-grid-2">
          <label className="ac10-checkbox"><input type="checkbox" name="is_active" defaultChecked={a.is_active ?? true} /> Active</label>
          <label className="ac10-checkbox"><input type="checkbox" name="independent_commission" defaultChecked={a.independent_commission ?? true} /> Use custom agent terms (not defaults)</label>
        </div>
        <Buttons onClose={onClose} ok="Save" />
      </form>
    </Dialog>
  );
}

// ---------------- Loyalty ----------------
const COUPON_COLS: Col[] = [{ key: "code", label: "CODE" }, { key: "discount_value", label: "DISCOUNT" }, { key: "audience", label: "AUDIENCE" }, { key: "channels", label: "CHANNELS" },
  { key: "min_fare", label: "MIN FARE", type: "money" }, { key: "max_discount_amount", label: "CAP", type: "money" }, { key: "per_user_limit", label: "LIMITS" },
  { key: "valid_until", label: "VALIDITY" }, { key: "uses_30d", label: "USED (30D)", type: "int" }, { key: "is_active", label: "STATUS" }, { key: "action", label: "ACTIONS" }];
export function LoyaltyTab() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dlg, setDlg] = useState<{ idx: number | null } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { api.admin<any>("/coupons").then((d) => setRows(d.coupons ?? [])).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); toastError(e); }); }, [reload]);
  if (err) return <div className="ac10-empty error"><Ic k="reports" s={30} /><b>Could not load coupons</b><p>{err}</p></div>;
  if (!rows) return <div className="ac10-loading">Loading Accounts…</div>;
  const toggle = async (c: any) => {
    if (!(await confirmDialog(`${c.is_active ? "Deactivate" : "Activate"} coupon ${c.code}?`, { ok: "Confirm" }))) return;
    try { await api.admin(`/coupons/${c.id}`, "PUT", { is_active: !c.is_active }); toast("Coupon updated", "ok"); setReload((x) => x + 1); } catch (e) { toastError(e); }
  };
  return (
    <>
      <div className="ac10-row-between ac10-reporttitle">
        <div><h2><span className="ac10-badgeicon"><Ic k="loyalty" /></span>{" Loyalty Coupons"}</h2><p>Operator-scoped catalogue. Codes here are validated server-side at booking time.</p></div>
        <Btn action="coupon-new" cls="primary purple" onClick={() => setDlg({ idx: null })}><Ic k="plus" s={17} />{" New Coupon"}</Btn>
      </div>
      <div className="ac10-section ac10-coupontable">
        <Table rows={rows} cols={COUPON_COLS} cell={(r: any, c) => {
          const idx = rows.indexOf(r);
          if (c.key === "discount_value") return <span className="ac10-type ok">{r.discount_type === "percent" || r.discount_type === "percentage" ? `${n(r.discount_value)}% off` : `${inr(r.discount_value)} flat`}</span>;
          if (c.key === "channels") return (r.channels ?? []).join(", ") || "All channels";
          if (c.key === "is_active") return <span className={`ac10-status ${r.is_active ? "ok" : "bad"}`}>{r.is_active ? "Active" : "Inactive"}</span>;
          if (c.key === "action") return <><Btn action="coupon-edit" cls="light" data-index={idx} onClick={() => setDlg({ idx })}><Ic k="edit" s={12} />{" Edit"}</Btn>{" "}
            <Btn action="coupon-toggle" cls={r.is_active ? "danger" : "green"} data-index={idx} onClick={() => toggle(r)}>{r.is_active ? "Deactivate" : "Activate"}</Btn></>;
          if (c.type === "int") return num(r[c.key]);
          return fmt(r[c.key], c.type);
        }} />
      </div>
      {dlg && <CouponDialog c={dlg.idx === null ? null : rows[dlg.idx]} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); toast("Coupon saved", "ok"); setReload((x) => x + 1); }} />}
    </>
  );
}

function CouponDialog({ c, onClose, onSaved }: { c: any | null; onClose: () => void; onSaved: () => void }) {
  const isNew = c === null;
  const x = c ?? { code: "", description: "", discount_type: "flat", discount_value: "", audience: "all", channels: ["website", "agent", "branch"], stackable: false, is_active: true, valid_from: "", valid_until: "" };
  const type = x.discount_type === "percentage" ? "percent" : x.discount_type;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = formVal(e.currentTarget);
    if (!(n(v.discount_value) > 0)) return toast("Discount must be positive", "bad");
    if (v.valid_from && v.valid_until && v.valid_from > v.valid_until) return toast("Invalid date range", "bad");
    const next: Record<string, any> = { ...v, code: String(v.code).toUpperCase(), channels: ["website", "agent", "branch"].filter((k) => v["channel_" + k]), valid_from: v.valid_from || null, valid_until: v.valid_until || null };
    for (const k of ["website", "agent", "branch"]) delete next["channel_" + k];
    try { if (isNew) await api.admin("/coupons", "POST", next); else await api.admin(`/coupons/${x.id}`, "PUT", next); onSaved(); } catch (err) { toastError(err); }
  };
  const extra = isNew ? { required: true, pattern: "[A-Za-z0-9]{3,20}" } : { readOnly: true };
  return (
    <Dialog title={isNew ? "New Coupon" : `Edit ${x.code}`} sub="Update this discount code" kind="ac10-coupon-modal" onClose={onClose}>
      <form data-coupon-form="" onSubmit={submit}>
        <div className="ac10-grid-2">
          <Field label="Code*" name="code" value={x.code} {...extra} />
          <Field label="Description" name="description" value={x.description} />
          <label className="ac10-field"><span>Type*</span><Sel name="discount_type" opts={[["flat", "Flat ₹"], ["percent", "Percent %"]]} cur={type} /></label>
          <Field label="Value*" name="discount_value" value={x.discount_value} type="number" required min="0" step="0.01" />
          <Field label="Min fare (₹)" name="min_fare" value={x.min_fare ?? ""} type="number" min="0" />
          <Field label="Max ₹ off (n/a)" name="max_discount_amount" value={x.max_discount_amount ?? ""} type="number" min="0" />
          <Field label="Total redemptions" name="total_limit" value={x.total_limit ?? ""} type="number" min="0" />
          <Field label="Per-user limit" name="per_user_limit" value={x.per_user_limit ?? ""} type="number" min="0" />
          <Field label="Valid from" name="valid_from" value={x.valid_from ?? ""} type="date" />
          <Field label="Valid until" name="valid_until" value={x.valid_until ?? ""} type="date" />
        </div>
        <label className="ac10-field"><span>Audience</span><Sel name="audience" opts={[["all", "Anyone"], ["new", "New customers"], ["repeat", "Repeat customers"]]} cur={x.audience} /></label>
        <div className="ac10-couponchannels"><b>Channels</b><div>
          {([["website", "Website"], ["agent", "Agent"], ["branch", "Branch"]] as const).map(([k, name]) =>
            <label key={k} className="ac10-checkbox"><input type="checkbox" name={`channel_${k}`} defaultChecked={(x.channels ?? []).includes(k)} />{` ${name}`}<small>{`Available to ${name} bookings`}</small></label>)}
        </div></div>
        <div className="ac10-couponflags">
          <label className="ac10-checkbox"><input name="private" type="checkbox" defaultChecked={!!x.private} /> Private</label>
          <label className="ac10-checkbox"><input name="stackable" type="checkbox" defaultChecked={!!x.stackable} /> Stackable with other discounts (miles, manual)</label>
          <label className="ac10-checkbox"><input name="is_active" type="checkbox" defaultChecked={!!x.is_active} /> Active</label>
        </div>
        <Buttons onClose={onClose} ok={isNew ? "Create coupon" : "Save changes"} />
      </form>
    </Dialog>
  );
}
