/* eslint-disable @typescript-eslint/no-explicit-any */
import { can, esc as escape, G, useLegacyPage } from "./legacy";

// React port of legacy Settings → About (public/js/about-v32.js). Builders verbatim; data: GET /about/build.
const paths: Record<string, string> = {
  bus: '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M4 14h16M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M10 5v8M7 19v2m10-2v2"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
  file: '<path d="M8 3h7l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v6h6M9 13h6m-6 4h6"/>',
  chat: '<rect x="3" y="4" width="18" height="14" rx="4"/><path d="m8 18-1 3 6-3m-7-7h1m4 0h1m4 0h1"/>',
  ticket: '<path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5zM12 6v12" stroke-dasharray="4 2"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',
  hash: '<path d="M8 3 5 21M17 3 14 21M3 9h18M2 16h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  commit: '<circle cx="12" cy="12" r="3"/><path d="M2 12h7m6 0h7"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M20 13v7H4V4h7"/>',
  refresh: '<path d="M21 7v6h-6M3 17v-6h6"/><path d="M20 13A8 8 0 0 0 5 7l-2 4m18 2-2 4a8 8 0 0 1-14 0"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  warning: '<path d="m12 2 10 19H2L12 2zm0 7v5m0 4v.01"/>',
};
const icon = (key: string) => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">' + (paths[key] || paths.layers) + "</svg>";
const badge = (ico: string, kind = "blue") => '<span class="ab32-icon ab32-' + escape(kind) + '">' + icon(ico) + "</span>";
const featureMeta: Record<string, [string, string, string]> = {
  "GDS Schedules": ["calendar", "#/gds/schedules", "schedules.view"],
  Tripsheets: ["file", "#/trips", "trips.view"],
  "Passenger Chats": ["chat", "#/chats", "chats.view"],
  Bookings: ["ticket", "#/gds/schedules", "bookings.create"],
};
let deferredInstall: any = null, installed = false;
const standalone = () => Boolean((typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone === true);
const activePage = () => document.querySelector<HTMLElement>("[data-ab32-page]");
function status(page: HTMLElement, text: string, tone = "info") {
  const n = page.querySelector<HTMLElement>("[data-ab32-status]"); if (!n) return;
  n.hidden = false; n.dataset.tone = tone; n.textContent = text;
}
function installStatus(page: HTMLElement, text: string, tone = "info") {
  const n = page.querySelector<HTMLElement>("[data-ab32-install-status]"); if (!n) return;
  n.hidden = false; n.dataset.tone = tone; n.textContent = text;
}
function updateInstallButton() {
  const page = activePage(); if (!page) return;
  const btn = page.querySelector<HTMLButtonElement>("[data-ab32-install]"); if (!btn) return;
  if (installed || standalone()) { btn.disabled = true; btn.innerHTML = icon("check") + " Installed"; }
  else { btn.disabled = false; btn.innerHTML = icon("download") + " Install app"; }
}
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstall = event; updateInstallButton(); });
window.addEventListener("appinstalled", () => { installed = true; deferredInstall = null; updateInstallButton(); const p = activePage(); if (p) installStatus(p, "App installed successfully.", "ok"); });
function displayTime(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not available";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}
function row(label: string, value: string, ico: string, link = "") {
  const detail = link
    ? '<a class="ab32-row-commit" target="_blank" rel="noopener noreferrer" href="' + escape(link) + '">' + escape(value || "Not available") + icon("external") + "</a>"
    : '<span class="ab32-value">' + escape(value || "Not available") + "</span>";
  return '<div class="ab32-row"><span class="ab32-row-symbol ab32-symbol-' + escape(ico) + '">' + icon(ico) + "</span>" + '<span class="ab32-row-label">' + escape(label) + "</span>" + detail + "</div>";
}
function panel(ico: string, name: string, subtitle: string, inside: string, trailing = "") {
  return '<section class="ab32-panel"><header class="ab32-panel-header">' + badge(ico) + '<div class="ab32-panel-heading"><h2>' + escape(name) + "</h2><p>" + escape(subtitle) + "</p></div>" + trailing + '</header><div class="ab32-panel-body">' + inside + "</div></section>";
}
function markup(info: any) {
  const host = location.host || "Local installation";
  const displayVersion = info.version + (info.short_commit ? "+" + info.short_commit : "");
  const dateIsBuild = Boolean(info.built_at);
  const date = dateIsBuild ? info.built_at : info.committed_at;
  const env = info.environment || "LOCAL";
  const featurePills = (info.features || Object.keys(featureMeta)).map((name: string) => {
    const [ico, href, perm] = featureMeta[name] || ["layers", "#/gds/schedules", "schedules.view"];
    const content = '<span class="ab32-feature-icon">' + icon(ico) + "</span>" + escape(name);
    return can(perm) ? '<a class="ab32-feature" href="' + escape(href) + '">' + content + "</a>" : '<span class="ab32-feature" aria-label="' + escape(name) + '">' + content + "</span>";
  }).join("");
  const hero = '<section class="ab32-hero"><div class="ab32-hero-top">' + badge("bus", "hero") + "<div><h1>" + escape(info.product || "JourneyOS Operator") + "</h1>" +
    '<a class="ab32-domain" href="/" target="_blank" rel="noopener noreferrer">' + icon("globe") + escape(host) + "</a></div></div>" +
    '<p class="ab32-description">' + escape(info.description || "Manage your bus operations from one place.") + "</p>" + '<div class="ab32-features">' + featurePills + "</div></section>";
  const dateTitle = dateIsBuild ? "BUILT" : date ? "COMMITTED" : "BUILT";
  const build = panel("layers", "Build & Version", "What you're running right now",
    row("VERSION", displayVersion, "hash") + row(dateTitle, displayTime(date), "clock") + row("COMMIT", info.short_commit || "Unavailable", "commit", info.commit_url) +
    '<button class="ab32-action" type="button" data-ab32-check>' + icon("refresh") + "<span data-ab32-check-label>Check for updates</span></button>" +
    '<p class="ab32-inline-status" data-ab32-status role="status" aria-live="polite" hidden></p>',
    '<span class="ab32-env ' + (env === "UAT" ? "uat" : "") + '"><i></i>' + escape(env) + "</span>");
  const install = panel("download", "Install app", "Add JourneyOS to your home screen",
    '<button class="ab32-action" type="button" data-ab32-install>' + icon("download") + " Install app</button>" +
    '<p class="ab32-inline-status" data-ab32-install-status role="status" aria-live="polite" hidden></p>');
  return '<div class="ab32-page" data-ab32-page><main class="ab32-container">' + hero + build + install + '<footer class="ab32-footer">Made for bus operators · © JourneyOS</footer>' + "</main></div>";
}
let loadedBuild: string | null = null;
async function checkUpdates(page: HTMLElement) {
  const button = page.querySelector<HTMLButtonElement>("[data-ab32-check]")!, label = page.querySelector<HTMLElement>("[data-ab32-check-label]")!;
  if (button.dataset.mode === "reload") { location.reload(); return; }
  button.disabled = true; label.textContent = "Checking…";
  try {
    const latest = await G.get("/about/build");
    const latestId = latest.build_id || null;
    if (loadedBuild && latestId && loadedBuild !== latestId) {
      status(page, "A newer version is available on this server. Reload to use it.", "ok");
      button.dataset.mode = "reload"; label.textContent = "Reload to update";
    } else if (!loadedBuild || !latestId) {
      status(page, "Version comparison unavailable: this deployment does not expose a build identifier.", "warn");
      label.textContent = "Check for updates";
    } else {
      status(page, "You're running the latest version deployed on this server.", "ok");
      label.textContent = "Check for updates";
    }
  } catch (e: any) {
    status(page, "Unable to check for updates: " + String(e.message || "Connection error"), "error");
    label.textContent = "Try again";
  } finally { button.disabled = false; }
}
async function installApp(page: HTMLElement) {
  const button = page.querySelector<HTMLButtonElement>("[data-ab32-install]")!;
  if (installed || standalone()) { installStatus(page, "This app is already running as an installed application.", "ok"); updateInstallButton(); return; }
  if (deferredInstall) {
    const prompt = deferredInstall; deferredInstall = null; button.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === "accepted") installStatus(page, "Installation accepted. Follow your browser to finish installing.", "ok");
      else installStatus(page, "Installation was dismissed. You can install it later from your browser menu.", "info");
    } catch (e: any) { installStatus(page, "The install prompt could not be opened: " + String(e.message || "browser restriction"), "error"); }
    finally { button.disabled = false; updateInstallButton(); }
    return;
  }
  const isiOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || "");
  if (isiOS) installStatus(page, "On iPhone or iPad, use Share → Add to Home Screen.", "info");
  else if (!window.isSecureContext) installStatus(page, "Installing requires HTTPS or localhost. Open this GDS securely, then use your browser’s Install app option.", "warn");
  else installStatus(page, "Use your browser menu → Install app (or Add to Home Screen). Your browser has not offered a direct install prompt.", "info");
}

export function AboutPage() {
  useLegacyPage((el, alive) => {
    const load = async () => {
      el.className = "ab32-route";
      el.innerHTML = '<div class="ab32-loading" role="status">Loading app details…</div>';
      try {
        const info = await G.get("/about/build");
        if (!alive()) return;
        loadedBuild ??= info.build_id || null;   // build served when this tab loaded (legacy __GDS_SERVED_BUILD__)
        el.innerHTML = markup(info);
        const page = el.querySelector<HTMLElement>("[data-ab32-page]")!;
        page.querySelector("[data-ab32-check]")!.addEventListener("click", () => checkUpdates(page));
        page.querySelector("[data-ab32-install]")!.addEventListener("click", () => installApp(page));
        updateInstallButton();
      } catch (e: any) {
        if (!alive()) return;
        el.innerHTML = '<div class="ab32-error" role="alert">Unable to load About: ' + escape(e.message) + '<button type="button" data-ab32-retry>Retry</button></div>';
        el.querySelector("[data-ab32-retry]")!.addEventListener("click", () => void load());
      }
    };
    return load();
  }, []);
  return null;
}
