// @ts-nocheck — DOM runtime for the vendored legacy Team & access layers (G shim + ui-common.js G.niceSelect verbatim).
import { api } from "../../api";
import { can, esc, G as base, permissions } from "./legacy";
import { installTeamAccess } from "./vendor/teamAccess.legacy";

const fdate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function niceSelect(sel) {
  if (!sel || sel._nice) return; sel._nice = true;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ui-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-label', sel.getAttribute('aria-label') || 'Choose');
  const label = () => { btn.innerHTML = `<span>${esc(sel.options[sel.selectedIndex]?.text || '')}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`; };
  label(); sel.classList.add('ui-dd-native'); sel.after(btn); sel.addEventListener('change', label); sel.addEventListener('ui:refresh', label);
  sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  sel.addEventListener('mousedown', (e) => { e.preventDefault(); btn.click(); });
  const host = sel.closest('label,.vp-select,.sp-filter,.ac10-select,.ui-dd-host');
  if (host && !host._ddHost) { host._ddHost = true; host.classList.add('ui-dd-hosted'); host.addEventListener('click', (e) => { if (e.target.closest('.ui-dd-menu') || btn.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); btn.click(); }); }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = document.querySelector('.ui-dd-menu'); if (open) { const same = open._btn === btn; open._close(); if (same) return; }
    const m = document.createElement('div'); m.className = 'ui-dd-menu'; m.setAttribute('role', 'listbox'); m._btn = btn;
    m.innerHTML = [...sel.options].map((o, i) => `<button type="button" role="option" data-i="${i}" class="${i === sel.selectedIndex ? 'sel' : ''}">${esc(o.text)}</button>`).join('');
    const r = (btn.closest('.vp-select,.sp-filter,.ac10-select,.ui-dd-host') || btn).getBoundingClientRect();
    m.style.minWidth = r.width + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 180) - 8)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
    const close = () => { m.remove(); if (m._outside) document.removeEventListener('click', m._outside, true); removeEventListener('scroll', close, true); };
    m._close = close;
    m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (!b) return; ev.stopPropagation(); sel.selectedIndex = Number(b.dataset.i); close(); sel.dispatchEvent(new Event('change', { bubbles: true })); });
    document.body.append(m);
    const mh = m.offsetHeight; if (r.bottom + 6 + mh > innerHeight - 8 && r.top - mh - 6 > 8) m.style.top = (r.top - mh - 6) + 'px';
    m.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    setTimeout(() => { const outside = (ev) => { if (m.contains(ev.target) || btn.contains(ev.target)) return; close(); }; document.addEventListener('click', outside, true); m._outside = outside; addEventListener('scroll', close, true); }, 0);
  });
}

let screen: ((el: HTMLElement, p: string[]) => Promise<void>) | null = null;
const G: any = {
  ...base,
  svg: (k) => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`,
  niceSelect,
  route: () => window.dispatchEvent(new HashChangeEvent("hashchange")),
  screens: { settings: async () => undefined },
  user: null,
  viewAs: localStorage.getItem("viewAs") || "",
  operator: {},
};

/** legacy G.screens.settings(el, ['team-access', sub, ...]) with the v26→v29 layers installed. */
export async function mountTeamAccess(el: HTMLElement, parts: string[]) {
  if (!G.user) { await permissions(); G.user = await api.admin("/auth/permissions").catch(() => null); }
  screen ??= installTeamAccess(G, esc, can, fdate);
  await screen(el, ["team-access", ...parts]);
}
export const closeTeamAccessOverlays = () => document.querySelectorAll(".stp-modal-backdrop,.ui-dd-menu,.ta26-backdrop,.ta28-backdrop").forEach((n) => n.remove());
