/* eslint-disable @typescript-eslint/no-explicit-any */
import { esc as quote, G, useLegacyPage } from "./legacy";

// React port of legacy Settings → WhatsApp (public/js/whatsapp-v33.js). Builders verbatim; data: /settings/whatsapp/onboarding.
// No connection is fabricated: when Meta credentials are not configured the server reports enabled=false.
const svg = '<svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.7 7.7L3 21l1.7-4.8A8.5 8.5 0 1 1 20.5 11.6Z"/></svg>';
let current: HTMLElement | null = null, server: any = null, setupPromise: Promise<any> | null = null, sdkPromise: Promise<any> | null = null, flow: any = null, sessionInfo: { waba_id: string; phone_number_id: string } | null = null;
let active = false, finished = false, pendingAuth: string | null = null;
const W = window as any;

function setMessage(page: HTMLElement, text: string, tone = "info") {
  const p = page.querySelector<HTMLElement>("[data-wa33-status]");
  if (!p) return;
  p.hidden = false; p.dataset.tone = tone; p.textContent = text;
}
function stopPrompt() { active = false; pendingAuth = null; sessionInfo = null; }
const originValid = (origin: string) => /^https:\/\/(www\.|web\.|business\.)?facebook\.com$/.test(origin);
function onMetaMessage(event: MessageEvent) {
  if (!active || !originValid(event.origin)) return;
  let data: any = event.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { return; } }
  if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
  const details = data.data || {};
  if (data.event === "CANCEL" || data.event === "ERROR") {
    if (current) setMessage(current, "WhatsApp signup was cancelled or could not be completed. Nothing has been connected.", "warn");
    stopPrompt(); return;
  }
  if (!String(data.event || "").startsWith("FINISH")) return;
  const ids = Array.isArray(details.messaging_account_ids) ? details.messaging_account_ids : Array.isArray(details.waba_ids) ? details.waba_ids : [details.waba_id];
  sessionInfo = { waba_id: String(ids.find(Boolean) || details.waba_id || ""), phone_number_id: String(details.phone_number_id || details.wa_phone_number_id || "") };
  maybeComplete();
}
const instructions = () => '<ol class="wa33-steps">' +
  "<li>Log in with the Facebook account of your business owner.</li>" +
  "<li>Create or pick your business, and enter the details exactly as on your GST certificate.</li>" +
  "<li>Add the phone number for WhatsApp and verify it with the code Meta sends.</li>" +
  "<li>Add a payment card for WhatsApp messages, when Meta asks.</li>" +
  "</ol>";
const initial = () => '<p class="wa33-caution">The number can’t already be on the WhatsApp or WhatsApp Business app. Your passengers keep getting messages from the current number until you switch over.</p>' +
  '<button type="button" class="wa33-button" data-wa33-connect>' + svg + "<span>Connect WhatsApp</span></button>" +
  '<p class="wa33-status" data-wa33-status role="status" aria-live="polite" hidden></p>';
const pending = (rec: any) => '<section class="wa33-connection" aria-label="Meta phone registration">' +
  '<div class="wa33-banner"><b>Meta authorization verified</b><span>Finish Cloud API phone registration before connecting messages.</span></div>' +
  '<div class="wa33-detail"><span>Business</span><strong>' + quote(rec.business_name || rec.waba_id) + "</strong></div>" +
  '<div class="wa33-detail"><span>WhatsApp number</span><strong>' + quote(rec.display_phone_number || rec.phone_number_id) + "</strong></div>" +
  '<form data-wa33-register><label for="wa33-pin">Six-digit two-step verification PIN</label>' +
  '<input id="wa33-pin" name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="6-digit PIN" />' +
  '<button type="submit" class="wa33-button">Complete registration</button></form>' +
  '<button type="button" class="wa33-text-button" data-wa33-disconnect>Cancel connection</button>' +
  '<p class="wa33-status" data-wa33-status role="status" aria-live="polite" hidden></p></section>';
const connected = (rec: any) => '<section class="wa33-connection" aria-label="Connected WhatsApp account">' +
  '<div class="wa33-banner connected"><b>WhatsApp number connected with Meta</b><span>The Cloud API number is registered. Delivery requires approved templates, webhook subscriptions and a configured sender.</span></div>' +
  '<div class="wa33-detail"><span>Business</span><strong>' + quote(rec.business_name || rec.waba_id) + "</strong></div>" +
  '<div class="wa33-detail"><span>WhatsApp number</span><strong>' + quote(rec.display_phone_number || rec.phone_number_id) + "</strong></div>" +
  '<div class="wa33-detail"><span>Registered</span><strong>' + quote(rec.connected_at ? new Date(rec.connected_at).toLocaleString("en-IN") : "Meta verified") + "</strong></div>" +
  '<button type="button" class="wa33-text-button danger" data-wa33-disconnect>Disconnect locally</button>' +
  '<p class="wa33-status" data-wa33-status role="status" aria-live="polite" hidden></p></section>';

function render(el: HTMLElement, data: any) {
  current = el; server = data;
  const conn = data.connection || {}, state = conn.status || "not_connected";
  el.className = "wa33-route";
  el.innerHTML = '<main class="wa33-page"><div class="wa33-container">' +
    '<header class="wa33-head"><span class="wa33-icon">' + svg + "</span>" +
    "<div><h1>WhatsApp</h1><p>Send tickets and trip updates from your own WhatsApp number</p></div></header>" +
    (state === "connected" ? connected(conn) : state === "pending_registration" ? pending(conn) : instructions() + initial()) +
    "</div></main>";
  if (state === "not_connected") {
    el.querySelector("[data-wa33-connect]")!.addEventListener("click", startMeta);
    if (data.enabled) prepare(data).catch((err) => { if (current === el) setMessage(el, "Unable to prepare Meta sign-in: " + err.message, "error"); });
  } else if (state === "pending_registration") {
    el.querySelector("[data-wa33-register]")!.addEventListener("submit", register);
  }
  el.querySelector("[data-wa33-disconnect]")?.addEventListener("click", disconnect);
}
function loadSDK(cfg: any): Promise<any> {
  if (W.FB?.login) return Promise.resolve(W.FB);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true; script.crossOrigin = "anonymous";
    script.onload = () => {
      if (!W.FB) { reject(new Error("Facebook SDK is unavailable")); return; }
      try { W.FB.init({ appId: cfg.app_id, autoLogAppEvents: false, xfbml: false, version: cfg.graph_version }); resolve(W.FB); } catch (e) { reject(e); }
    };
    script.onerror = () => reject(new Error("Could not load Meta’s login SDK."));
    document.head.appendChild(script);
  }).catch((e) => { sdkPromise = null; throw e; });
  return sdkPromise;
}
function prepare(data: any) {
  if (setupPromise) return setupPromise;
  setupPromise = Promise.all([G.post("/settings/whatsapp/onboarding/start", {}), loadSDK(data)])
    .then(([s]) => { flow = s; return s; }).finally(() => { setupPromise = null; });
  return setupPromise;
}
function maybeComplete() {
  if (finished || !pendingAuth || !sessionInfo || !current) return;
  if (!/^\d{5,30}$/.test(sessionInfo.waba_id) || !/^\d{5,30}$/.test(sessionInfo.phone_number_id)) return;
  finished = true;
  const page = current; setMessage(page, "Verifying the business and phone with Meta…");
  const payload = { state: flow?.state, code: pendingAuth, waba_id: sessionInfo.waba_id, phone_number_id: sessionInfo.phone_number_id };
  G.post("/settings/whatsapp/onboarding/finish", payload)
    .then(async () => { stopPrompt(); flow = null; const result = await G.get("/settings/whatsapp/onboarding"); if (current === page) render(page, result); })
    .catch((e) => { stopPrompt(); flow = null; if (current === page) setMessage(page, "Could not verify Meta signup: " + e.message, "error"); });
}
function startMeta() {
  const page = current;
  if (!page || !server) return;
  if (!server.enabled) {
    setMessage(page, "Meta Embedded Signup is not configured for JourneyOS. Set META_APP_ID, META_APP_SECRET, META_WHATSAPP_CONFIG_ID and GDS_WA_ENCRYPTION_KEY on the server.", "warn");
    return;
  }
  if (!window.isSecureContext) { setMessage(page, "Meta onboarding requires an HTTPS deployment or localhost.", "warn"); return; }
  if (!flow || !W.FB?.login) {
    setMessage(page, "Preparing secure Meta signup. Press Connect WhatsApp again when ready.", "info");
    prepare(server).catch((e) => { if (current === page) setMessage(page, e.message, "error"); });
    return;
  }
  active = true; finished = false; sessionInfo = null; pendingAuth = null;
  setMessage(page, "Complete Meta’s official signup window. No number is connected until verification succeeds.");
  try {
    W.FB.login((response: any) => {
      if (current !== page) return;
      const code = response?.authResponse?.code;
      if (!code) { setMessage(page, "Meta signup was not completed. No WhatsApp number has been connected.", "warn"); stopPrompt(); return; }
      pendingAuth = String(code); maybeComplete();
      if (!sessionInfo) setMessage(page, "Meta authorized the account. Waiting for the verified business and phone identifiers…", "info");
    }, { config_id: server.configuration_id, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
  } catch (e: any) { stopPrompt(); setMessage(page, "Meta could not open signup: " + e.message, "error"); }
}
async function register(e: Event) {
  e.preventDefault(); const page = current!, form = e.currentTarget as HTMLFormElement;
  if (!form.reportValidity()) return;
  const button = form.querySelector("button")!, pin = (form.elements.namedItem("pin") as HTMLInputElement).value;
  button.disabled = true;
  try {
    const result = await G.post("/settings/whatsapp/onboarding/register", { pin });
    form.reset();
    if (current === page) { const updated = await G.get("/settings/whatsapp/onboarding"); render(page, updated); setMessage(page, result.notice || "Meta phone registration complete.", "ok"); }
  } catch (error: any) { if (current === page) setMessage(page, error.message, "error"); }
  finally { button.disabled = false; }
}
async function disconnect() {
  const page = current!;
  if (!window.confirm("Disconnect WhatsApp from this GDS? This deletes local authorization but does not revoke permissions in Meta Business Manager.")) return;
  try {
    await G.post("/settings/whatsapp/onboarding/disconnect", { confirm: "DISCONNECT" });
    flow = null; stopPrompt();
    const updated = await G.get("/settings/whatsapp/onboarding");
    if (current === page) { render(page, updated); setMessage(page, "Local WhatsApp authorization removed. Revoke partner access separately in Meta if required.", "ok"); }
  } catch (e: any) { if (current === page) setMessage(page, e.message, "error"); }
}

export function WhatsAppPage() {
  useLegacyPage((el, alive) => {
    window.addEventListener("message", onMetaMessage);
    const load = async () => {
      try { const d = await G.get("/settings/whatsapp/onboarding"); if (alive()) render(el, d); }
      catch (e: any) {
        if (!alive()) return;
        el.className = "wa33-route";
        el.innerHTML = '<div class="wa33-error">Unable to load WhatsApp setup: ' + quote(e.message) + '<button type="button" data-wa33-retry>Retry</button></div>';
        el.querySelector<HTMLElement>("[data-wa33-retry]")!.onclick = () => void load();
      }
    };
    void load();
    return () => { window.removeEventListener("message", onMetaMessage); stopPrompt(); current = null; };
  }, []);
  return null;
}
