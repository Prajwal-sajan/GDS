import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";

// Settings → WhatsApp (legacy whatsapp-v33 layout, wa33-* classes): Meta Embedded Signup → Cloud API phone registration.
// No connection is fabricated: when Meta credentials are not configured the server reports enabled=false.

interface Connection { status?: "not_connected" | "pending_registration" | "connected"; business_name?: string; waba_id?: string; display_phone_number?: string; phone_number_id?: string; connected_at?: string }
interface Onboarding { enabled: boolean; app_id?: string; graph_version?: string; configuration_id?: string; connection?: Connection }
type Tone = "info" | "ok" | "warn" | "error";
interface FbSdk { init(o: object): void; login(cb: (r: { authResponse?: { code?: string } }) => void, o: object): void }
type FbWindow = Window & { FB?: FbSdk };

const WaIcon = () => <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.7 7.7L3 21l1.7-4.8A8.5 8.5 0 1 1 20.5 11.6Z" /></svg>;
const W = window as FbWindow;
const metaOrigin = (o: string) => /^https:\/\/(www\.|web\.|business\.)?facebook\.com$/.test(o);

let sdk: Promise<FbSdk> | null = null;
function loadSdk(cfg: Onboarding): Promise<FbSdk> {
  if (W.FB?.login) return Promise.resolve(W.FB);
  return (sdk ??= new Promise<FbSdk>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js"; s.async = true; s.crossOrigin = "anonymous";
    s.onload = () => { if (!W.FB) return reject(new Error("Facebook SDK is unavailable")); try { W.FB.init({ appId: cfg.app_id, autoLogAppEvents: false, xfbml: false, version: cfg.graph_version }); resolve(W.FB); } catch (e) { reject(e); } };
    s.onerror = () => reject(new Error("Could not load Meta’s login SDK."));
    document.head.appendChild(s);
  }).catch((e) => { sdk = null; throw e; }));
}
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function WhatsAppPage() {
  const [data, setData] = useState<Onboarding>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<{ text: string; tone: Tone }>();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Embedded-signup handshake: FB.login returns the auth code, a postMessage from facebook.com carries the WABA/phone ids.
  const flow = useRef<{ state?: string } | null>(null);
  const hs = useRef({ active: false, finished: false, code: null as string | null, ids: null as { waba_id: string; phone_number_id: string } | null });
  const alive = useRef(true);
  const say = (text: string, tone: Tone = "info") => alive.current && setStatus({ text, tone });

  const load = useCallback(async () => {
    try { const d = await api.admin<Onboarding>("/settings/whatsapp/onboarding"); if (alive.current) { setData(d); setError(undefined); } return d; }
    catch (e) { if (alive.current) setError(msgOf(e)); return undefined; }
  }, []);
  const prepare = useCallback(async (d: Onboarding) => {
    const [s] = await Promise.all([api.admin<{ state?: string }>("/settings/whatsapp/onboarding/start", "POST", {}), loadSdk(d)]);
    flow.current = s;
  }, []);
  const stop = () => { hs.current = { active: false, finished: hs.current.finished, code: null, ids: null }; };

  const maybeComplete = useCallback(() => {
    const h = hs.current;
    if (h.finished || !h.code || !h.ids || !/^\d{5,30}$/.test(h.ids.waba_id) || !/^\d{5,30}$/.test(h.ids.phone_number_id)) return;
    h.finished = true;
    say("Verifying the business and phone with Meta…");
    api.admin("/settings/whatsapp/onboarding/finish", "POST", { state: flow.current?.state, code: h.code, ...h.ids })
      .then(async () => { stop(); flow.current = null; setStatus(undefined); await load(); })
      .catch((e) => { stop(); flow.current = null; say("Could not verify Meta signup: " + msgOf(e), "error"); });
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void load().then((d) => { if (d?.enabled && (d.connection?.status ?? "not_connected") === "not_connected") prepare(d).catch((e) => say("Unable to prepare Meta sign-in: " + msgOf(e), "error")); });
    const onMessage = (ev: MessageEvent) => {
      if (!hs.current.active || !metaOrigin(ev.origin)) return;
      let m = ev.data;
      if (typeof m === "string") { try { m = JSON.parse(m); } catch { return; } }
      if (!m || m.type !== "WA_EMBEDDED_SIGNUP") return;
      const det = m.data || {};
      if (m.event === "CANCEL" || m.event === "ERROR") { say("WhatsApp signup was cancelled or could not be completed. Nothing has been connected.", "warn"); stop(); return; }
      if (!String(m.event || "").startsWith("FINISH")) return;
      const ids: unknown[] = Array.isArray(det.messaging_account_ids) ? det.messaging_account_ids : Array.isArray(det.waba_ids) ? det.waba_ids : [det.waba_id];
      hs.current.ids = { waba_id: String(ids.find(Boolean) || det.waba_id || ""), phone_number_id: String(det.phone_number_id || det.wa_phone_number_id || "") };
      maybeComplete();
    };
    window.addEventListener("message", onMessage);
    return () => { alive.current = false; window.removeEventListener("message", onMessage); stop(); };
  }, [load, prepare, maybeComplete]);

  const connect = () => {
    if (!data) return;
    if (!data.enabled) return say("Meta Embedded Signup is not configured for JourneyOS. Set META_APP_ID, META_APP_SECRET, META_WHATSAPP_CONFIG_ID and GDS_WA_ENCRYPTION_KEY on the server.", "warn");
    if (!window.isSecureContext) return say("Meta onboarding requires an HTTPS deployment or localhost.", "warn");
    if (!flow.current || !W.FB?.login) {
      say("Preparing secure Meta signup. Press Connect WhatsApp again when ready.");
      prepare(data).catch((e) => say(msgOf(e), "error"));
      return;
    }
    hs.current = { active: true, finished: false, code: null, ids: null };
    say("Complete Meta’s official signup window. No number is connected until verification succeeds.");
    try {
      W.FB.login((r) => {
        const code = r?.authResponse?.code;
        if (!code) { say("Meta signup was not completed. No WhatsApp number has been connected.", "warn"); stop(); return; }
        hs.current.code = String(code); maybeComplete();
        if (!hs.current.ids) say("Meta authorized the account. Waiting for the verified business and phone identifiers…");
      }, { config_id: data.configuration_id, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
    } catch (e) { stop(); say("Meta could not open signup: " + msgOf(e), "error"); }
  };
  const register = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setBusy(true);
    try {
      const r = await api.admin<{ notice?: string }>("/settings/whatsapp/onboarding/register", "POST", { pin });
      setPin(""); await load(); say(r.notice || "Meta phone registration complete.", "ok");
    } catch (err) { say(msgOf(err), "error"); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect WhatsApp from this GDS? This deletes local authorization but does not revoke permissions in Meta Business Manager.")) return;
    try {
      await api.admin("/settings/whatsapp/onboarding/disconnect", "POST", { confirm: "DISCONNECT" });
      flow.current = null; stop(); await load();
      say("Local WhatsApp authorization removed. Revoke partner access separately in Meta if required.", "ok");
    } catch (e) { say(msgOf(e), "error"); }
  };

  if (error) return <div className="wa33-route"><div className="wa33-error">Unable to load WhatsApp setup: {error}<button type="button" onClick={() => void load()}>Retry</button></div></div>;
  if (!data) return <div className="wa33-route"><div className="empty">Loading…</div></div>;

  const conn = data.connection ?? {}, state = conn.status ?? "not_connected";
  const statusLine = <p className="wa33-status" role="status" aria-live="polite" hidden={!status} data-tone={status?.tone}>{status?.text}</p>;
  const details = <>
    <div className="wa33-detail"><span>Business</span><strong>{conn.business_name || conn.waba_id}</strong></div>
    <div className="wa33-detail"><span>WhatsApp number</span><strong>{conn.display_phone_number || conn.phone_number_id}</strong></div>
  </>;
  return (
    <div className="wa33-route">
      <main className="wa33-page"><div className="wa33-container">
        <header className="wa33-head"><span className="wa33-icon"><WaIcon /></span><div><h1>WhatsApp</h1><p>Send tickets and trip updates from your own WhatsApp number</p></div></header>
        {state === "connected" ? (
          <section className="wa33-connection" aria-label="Connected WhatsApp account">
            <div className="wa33-banner connected"><b>WhatsApp number connected with Meta</b><span>The Cloud API number is registered. Delivery requires approved templates, webhook subscriptions and a configured sender.</span></div>
            {details}
            <div className="wa33-detail"><span>Registered</span><strong>{conn.connected_at ? new Date(conn.connected_at).toLocaleString("en-IN") : "Meta verified"}</strong></div>
            <button type="button" className="wa33-text-button danger" onClick={() => void disconnect()}>Disconnect locally</button>
            {statusLine}
          </section>
        ) : state === "pending_registration" ? (
          <section className="wa33-connection" aria-label="Meta phone registration">
            <div className="wa33-banner"><b>Meta authorization verified</b><span>Finish Cloud API phone registration before connecting messages.</span></div>
            {details}
            <form onSubmit={(e) => void register(e)}>
              <label htmlFor="wa33-pin">Six-digit two-step verification PIN</label>
              <input id="wa33-pin" name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="6-digit PIN" value={pin} onChange={(e) => setPin(e.currentTarget.value)} />
              <button type="submit" className="wa33-button" disabled={busy}>Complete registration</button>
            </form>
            <button type="button" className="wa33-text-button" onClick={() => void disconnect()}>Cancel connection</button>
            {statusLine}
          </section>
        ) : <>
          <ol className="wa33-steps">
            <li>Log in with the Facebook account of your business owner.</li>
            <li>Create or pick your business, and enter the details exactly as on your GST certificate.</li>
            <li>Add the phone number for WhatsApp and verify it with the code Meta sends.</li>
            <li>Add a payment card for WhatsApp messages, when Meta asks.</li>
          </ol>
          <p className="wa33-caution">The number can’t already be on the WhatsApp or WhatsApp Business app. Your passengers keep getting messages from the current number until you switch over.</p>
          <button type="button" className="wa33-button" onClick={connect}><WaIcon /><span>Connect WhatsApp</span></button>
          {statusLine}
        </>}
      </div></main>
    </div>
  );
}
