// @ts-nocheck — verbatim port of the shared settings kit from legacy public/js/settings-parity.js (icon, BRANDING_UPLOADS)
// and settings-complete.js (drawTitle/card/input/modal/note + showBranding/showPassword/showDevices). DOM kept 1:1 for stp-* CSS.
import { logout, setKey } from "../../api";
import { esc, G, can } from "./legacy";

const ICONS = {
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>',
  settings: '<path d="M12 8.4A3.6 3.6 0 1112 15.6 3.6 3.6 0 0112 8.4z"/><path d="M4.6 12a7.7 7.7 0 01.1-1.2l-2-1.6 2-3.5 2.4.8a8.5 8.5 0 012-1.2l.4-2.5h4l.4 2.5a8.5 8.5 0 012 1.2l2.4-.8 2 3.5-2 1.6c.1.4.1.8.1 1.2s0 .8-.1 1.2l2 1.6-2 3.5-2.4-.8a8.5 8.5 0 01-2 1.2l-.4 2.5h-4l-.4-2.5a8.5 8.5 0 01-2-1.2l-2.4.8-2-3.5 2-1.6c-.1-.4-.1-.8-.1-1.2z"/>',
  trips: '<path d="M7 6h10M7 12h10M7 18h7"/><rect x="4" y="3" width="16" height="18" rx="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  chats: '<path d="M8 17l-4 3V7a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3H8z"/><path d="M9 10h6M9 14h4"/>',
  calls: '<path d="M15.8 15.4c-2.2 2.2-6.4-2-8.6-4.2S.8 4.8 3 2.6c.8-.8 2-.8 2.8 0L8.3 5A2 2 0 018.8 7l-1.3 2a11.3 11.3 0 007.2 7.2l2-1.3a2 2 0 012 .5l2.4 2.4c.8.8.8 2 0 2.8-1.2 1.2-3.7 1.5-5.3-.2z"/>',
  users: '<path d="M16 19a4 4 0 00-8 0"/><circle cx="12" cy="8" r="4"/><path d="M20 19a4 4 0 00-3-3.87M4 19a4 4 0 013-3.87"/>',
  bus: '<rect x="4" y="6" width="16" height="10" rx="2"/><path d="M4 12h16M8 16v2M16 16v2M7.5 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>',
  agent: '<path d="M17 7l-5-4-5 4v10l5 4 5-4z"/><path d="M12 8v8M8.5 10h7"/>',
  building: '<path d="M4 20h16M6 20V8l6-4 6 4v12M9 10h1M9 13h1M9 16h1M14 10h1M14 13h1M14 16h1"/>',
  key: '<path d="M15 7a4 4 0 11-3.9 5H4l-2 2 2 2 2-2h2l2-2h1.1A4 4 0 0115 7z"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20l4.5-1 9.1-9.1a2 2 0 00-2.8-2.8L5.7 16.2 4 20z"/><path d="M13.5 5.5l3 3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7v12a2 2 0 002 2h6a2 2 0 002-2V7M10 11v6M14 11v6"/>',
  phone: '<path d="M15.8 15.4c-2.2 2.2-6.4-2-8.6-4.2S.8 4.8 3 2.6c.8-.8 2-.8 2.8 0L8.3 5A2 2 0 018.8 7l-1.3 2a11.3 11.3 0 007.2 7.2l2-1.3a2 2 0 012 .5l2.4 2.4c.8.8.8 2 0 2.8-1.2 1.2-3.7 1.5-5.3-.2z"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.6 8.3-7 10-3.4-1.7-7-5-7-10V6l7-3z"/>',
  activity: '<path d="M3 12h4l2-4 3 8 3-6h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  mail: '<path d="M4 6h16v12H4z"/><path d="M4 8l8 6 8-6"/>',
  pulse: '<path d="M3 12h5l2-4 3 8 2-5h6"/>',
  calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"/>',
  preview: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  reset: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M6.5 9A7 7 0 0118 6M17.5 15A7 7 0 016 18"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4M9 20v-6h6v6"/>',
  badge: '<path d="M9 12l2 2 4-4"/><path d="M12 2l2 2.3 3-.5.5 3L20 9l-2 2 2 2-1.5 2.2.5 3-3-.5L12 22l-2.5-2.3-3 .5.5-3L4 13l2-2-2-2 1.5-2.2-.5-3 3 .5L12 2z"/>',
  droplet: '<path d="M12 3s5 5.5 5 9a5 5 0 01-10 0c0-3.5 5-9 5-9z"/>',
  desktop: '<path d="M4 5h16v10H4z"/><path d="M9 19h6M12 15v4"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 13l2.5-3 3.5 4 2-2 2 3"/><circle cx="9" cy="9" r="1.2"/>',
  upload: '<path d="M12 16V6"/><path d="M8 10l4-4 4 4"/><path d="M5 19h14"/>',
  mobile: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M11 18h2"/>',
  hash: '<path d="M9 3L7 21M17 3l-2 18M4 9h16M3 15h16"/>',
  brush: '<path d="M13 4l7 7-5 5-7-7z"/><path d="M6 18c-2 0-3 1-3 3 2 0 4-1 4-3 0-1-1-2-1-2s-1 1-1 2z"/>',
  sliders: '<path d="M4 6h6M14 6h6M10 6v6M4 18h10M18 18h2M14 18v-6M4 12h2M10 12h10M6 12V6"/>',
  chat: '<path d="M8 17l-4 3V7a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3H8z"/>',
  spark: '<path d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2z"/><path d="M5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14zm14 1l.5 1.7 1.7.5-1.7.5-.5 1.8-.5-1.8-1.7-.5 1.7-.5.5-1.7z"/>',
  switchUser: '<path d="M16 17l4-4-4-4"/><path d="M20 13H9"/><path d="M8 7A4 4 0 118 15M4 19a4 4 0 014-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
  phoneDevice: '<rect x="8" y="3" width="8" height="18" rx="2"/><circle cx="12" cy="17" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v5"/><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none"/>',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
}
export const escV = (v) => esc(v ?? '');
export const allowed = (p) => can(p);
export const DATES = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const BRANDING_UPLOADS = [
  { label: 'Mobile logo', state: 'hasLogo', note: 'Best size 352 × 96 px (shows up to 176 × 48)' },
  { label: 'Desktop logo', state: 'empty', empty: 'No desktop logo', note: 'Best size 576 × 112 px (shows up to 288 × 56). Empty → mobile logo is used' },
  { label: 'Logo (dark)', state: 'empty', empty: 'No logo (dark)' },
  { label: 'Favicon', state: 'empty', empty: 'No favicon' },
  { label: 'Signin background', state: 'empty', empty: 'No signin background' },
];
const ASSET_CODES = ['mobile_logo', 'desktop_logo', 'dark_logo', 'favicon', 'signin_background'];

export function drawTitle(text, action = '', actionCode = '', symbol = 'bus') {
  return `<header class="stp-page-title"><div class="stp-page-title-main"><div class="stp-hero-icon">${icon(symbol)}</div><h1>${escV(text)}</h1></div>${action ? `<button class="stp-btn primary" type="button" data-page-action="${escV(actionCode)}">${icon('users')} ${escV(action)}</button>` : ''}</header>`;
}
export function card(heading, body, ico = 'settings', extra = '') {
  return `<section class="stp-brand-card ${extra}"><header class="stp-card-head"><div class="stp-hero-icon" style="width:54px;height:54px">${icon(ico)}</div><h3>${escV(heading)}</h3></header>${body}</section>`;
}
export function input(name, title, value = '', opts = {}) {
  const kind = opts.type || 'text';
  if (kind === 'select') return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><select class="stp-input" name="${escV(name)}">${(opts.values || []).map(([v, t]) => `<option value="${escV(v)}" ${String(v) === String(value) ? 'selected' : ''}>${escV(t)}</option>`).join('')}</select></label>`;
  if (kind === 'textarea') return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><textarea class="stp-input" name="${escV(name)}" rows="3">${escV(value)}</textarea></label>`;
  if (kind === 'checkbox') return `<label class="stp-check-label"><input type="checkbox" name="${escV(name)}" ${value ? 'checked' : ''}>${escV(title)}</label>`;
  return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><input class="stp-input" name="${escV(name)}" type="${escV(kind)}" value="${escV(value)}" ${opts.required ? 'required' : ''} ${opts.placeholder ? `placeholder="${escV(opts.placeholder)}"` : ''} ${opts.min != null ? `min="${opts.min}"` : ''} ${opts.max != null ? `max="${opts.max}"` : ''}></label>`;
}
export const values = (root) => { const form = root.querySelector('form') || root; const out = {}; form.querySelectorAll('[name]').forEach(node => { out[node.name] = node.type === 'checkbox' ? node.checked : node.type === 'number' && node.value !== '' ? Number(node.value) : node.value; }); return out; };
export function modal({ title, body, subtitle = '', onSave, save = 'Save', danger = false, wide = false, closeLabel = 'Close' }) {
  const overlay = document.createElement('div'); overlay.className = 'stp-modal-backdrop';
  overlay.innerHTML = `<div class="stp-modal ${wide ? 'stp-modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escV(title)}"><div class="stp-modal-head"><div><h3 style="margin:0;font-size:23px">${escV(title)}</h3>${subtitle ? `<p class="stp-muted" style="margin:8px 0 0">${escV(subtitle)}</p>` : ''}</div><button class="stp-modal-close" type="button" data-close-modal aria-label="Close">${icon('close')}</button></div><div class="stp-modal-body stp-work-modal-body"><form>${body}</form></div><footer class="stp-modal-foot">${onSave ? `<button type="button" data-modal-save class="stp-btn ${danger ? 'stp-danger' : 'primary'}">${escV(save)}</button>` : ''}<button type="button" class="stp-btn" data-close-modal>${closeLabel}</button></footer></div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', escKey); };
  const escKey = (e) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', escKey);
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close-modal]')) close(); });
  const commit = overlay.querySelector('[data-modal-save]');
  if (commit) commit.onclick = async () => { const form = overlay.querySelector('form'); if (!form.reportValidity()) return; commit.disabled = true; try { const ok = await onSave(values(overlay), overlay); if (ok !== false) close(); } catch (e) { G.err(e); } finally { commit.disabled = false; } };
  document.body.append(overlay); overlay.querySelector('input,select,textarea')?.focus();
  return { el: overlay, close, form: overlay.querySelector('form') };
}
export function note(text) { return `<p class="stp-note-text">${escV(text)}</p>`; }
export function emptyPanel(label, text, ico = 'building') {
  return `<div class="stp-empty-panel"><div class="stp-big-ico">${icon(ico)}</div><h3>${escV(label)}</h3><p>${escV(text)}</p></div>`;
}

/* ---- Branding ---- */
function brandField(title, name, value, ico = 'badge', options = null) {
  return `<label class="stp-field-wrap"><span class="stp-label">${escV(title)}</span><span class="stp-field"><span class="ico">${icon(ico)}</span>${options ? `<select data-brand="${name}">${options.map(x => `<option ${String(x) === String(value) ? 'selected' : ''}>${escV(x)}</option>`).join('')}</select>` : `<input data-brand="${name}" value="${escV(value)}">`}</span></label>`;
}
function palette(color) {
  const raw = String(color || '#2563EB').toUpperCase();
  return [raw, '#5686F1', '#7E9EF4', '#A7BDF9', '#C3D3FC'];
}
function brandPreview(data) {
  const op = data.operator || {}, b = data.branding || {};
  const pal = palette(op.brand_hex);
  const src = b.assets?.mobile_logo || op.logo_url;
  return `<div class="stp-brand-hero"><div class="stp-brand-left"><div class="stp-brand-logo">${src ? `<img src="${escV(src)}" alt="Brand logo"/>` : '<div class="stp-brand-logo-mark"><span>GDS</span> Operator</div>'}</div><div class="stp-brand-text"><h2 data-preview-name>${escV(op.app_name || op.operator_name || 'Operator')}</h2><p data-preview-tagline>${escV(op.tagline || '')}</p><div class="stp-brand-chip-row"><span class="stp-brand-chip">${icon('phone')}<span data-preview-phone>${escV(op.helpline_number || '—')}</span></span><span class="stp-brand-chip">${icon('mail')}<span data-preview-email>${escV(op.support_email || '—')}</span></span></div></div></div><div class="stp-palette-preview" data-palette-preview>${pal.map(x => `<span class="sw" style="background:${escV(x)}"></span>`).join('')}</div></div>`;
}
function assetUpload(item, index, assetData) {
  const key = ASSET_CODES[index], src = assetData?.[key] || '';
  const label = item.label;
  return `<div class="stp-upload-card" data-asset="${key}"><label>${escV(label)}</label><div class="stp-upload-box"><div class="stp-asset-preview">${src ? `<img src="${escV(src)}" alt="${escV(label)}"/>` : `<div class="stp-upload-placeholder">${icon('image')}</div><b>${escV(item.empty || 'No image')}</b>`}</div><button class="stp-upload-action" type="button" data-asset-pick="${key}">${icon('upload')} Upload</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden data-asset-file="${key}">${src ? `<button class="stp-asset-remove" type="button" data-asset-remove="${key}">Remove</button>` : ''}</div>${item.note ? `<div class="stp-help-text">${escV(item.note)}</div>` : ''}</div>`;
}
export async function showBranding(el) {
  const data = await G.get('/settings/branding');
  const o = data.operator || {}, b = data.branding || {}; const assets = b.assets || {};
  const currentHex = o.brand_hex || '#2563EB';
  let html = drawTitle('Branding', '', '', 'brush');
  html += `<div class="stp-brand-toolbar stp-brand-page-actions"><button class="stp-btn" data-brand-preview>${icon('preview')} Preview</button><button class="stp-btn" data-brand-reset>${icon('reset')} Reset</button><button class="stp-btn primary" data-brand-save ${allowed('settings.modify') ? '' : 'disabled'}>${icon('save')} Save</button></div>`;
  html += `<div class="stp-brand-preview">${brandPreview(data)}</div>`;
  html += card('Identity', `<div class="stp-form-grid">${brandField('App name', 'appName', o.app_name || '', 'badge')}${brandField('Tagline', 'tagline', o.tagline || '', 'spark')}${brandField('Helpline', 'helpline', o.helpline_number || '', 'phone')}${brandField('Support email', 'supportEmail', o.support_email || '', 'mail')}</div>`, 'badge');
  html += card('Colors & Typography', `<div class="stp-color-panel"><div><div class="stp-field-wrap"><label>Brand color</label><div class="stp-color-well"><div class="stp-color-box" data-brand-color-box style="background:${escV(currentHex)}"></div><div class="stp-color-input"><span class="ico">${icon('droplet')}</span><input data-brand="brandColor" value="${escV(currentHex)}" aria-label="Brand color"/></div></div><div class="stp-color-strip">${palette(currentHex).map(x => `<button type="button" data-palette="${escV(x)}" title="Choose ${escV(x)}"><span class="sw long" style="background:${escV(x)}"></span></button>`).join('')}</div></div><div class="stp-field-wrap" style="margin-top:22px"><label>Color scheme</label><div class="stp-scheme-row">${['Light', 'Dark', 'System'].map(v => `<button class="stp-scheme ${(b.color_scheme || 'Light') === v ? 'active' : ''}" data-scheme="${v}" type="button">${icon(v === 'Light' ? 'spark' : v === 'Dark' ? 'globe' : 'desktop')} ${v}</button>`).join('')}</div></div></div><div>${brandField('Font family', 'fontFamily', o.font_family || 'Poppins', 'badge', ['Poppins', 'Inter', 'Manrope', 'Roboto', 'System'])}</div></div>`, 'settings');
  html += card('Logo & Assets', `<div class="stp-assets-grid">${BRANDING_UPLOADS.map((it, i) => assetUpload(it, i, assets)).join('')}</div><div class="stp-note-line">Logos: use PNG, JPEG or WebP under 1 MB. SVG upload is disabled until server-side sanitization is available. Tap the logo in the header to return home.</div>`, 'image');
  html += card('PWA Advanced', `<div class="stp-form-grid">${brandField('PWA name', 'pwaName', b.pwa_name || o.app_name || '', 'mobile')}${brandField('PWA short name', 'pwaShortName', b.pwa_short_name || '', 'hash')}</div><p class="stp-muted">App name, color and icon are served by the live manifest. Installed apps may need to be restarted or reinstalled to refresh branding; offline support requires a separate service-worker rollout.</p>`, 'mobile');
  el.innerHTML = `<div class="stp-shell stp-brand-shell">${html}</div>`;
  const field = (key) => el.querySelector(`[data-brand="${key}"]`);
  const current = () => ({ app_name: field('appName')?.value || '', tagline: field('tagline')?.value || '', helpline_number: field('helpline')?.value || '', support_email: field('supportEmail')?.value || '', brand_hex: field('brandColor')?.value || '', font_family: field('fontFamily')?.value || 'Poppins', color_scheme: el.querySelector('[data-scheme].active')?.dataset.scheme || 'Light', pwa_name: field('pwaName')?.value || '', pwa_short_name: field('pwaShortName')?.value || '' });
  const update = () => {
    const v = current();
    const set = (sel, value) => { const n = el.querySelector(sel); if (n) n.textContent = value; };
    set('[data-preview-name]', v.app_name); set('[data-preview-tagline]', v.tagline); set('[data-preview-phone]', v.helpline_number); set('[data-preview-email]', v.support_email);
    el.querySelector('.stp-brand-preview')?.setAttribute('data-scheme', v.color_scheme);
    if (/^#[a-f\d]{6}$/i.test(v.brand_hex)) {
      const bx = el.querySelector('[data-brand-color-box]'); if (bx) bx.style.background = v.brand_hex;
      const p = el.querySelector('[data-palette-preview]'); if (p) p.innerHTML = palette(v.brand_hex).map(c => `<span class="sw" style="background:${c}"></span>`).join('');
    }
  };
  el.querySelectorAll('[data-brand]').forEach(inp => inp.addEventListener('input', update));
  el.querySelectorAll('[data-palette]').forEach(btn => btn.onclick = () => { field('brandColor').value = btn.dataset.palette; update(); });
  el.querySelectorAll('[data-scheme]').forEach(btn => btn.onclick = () => { el.querySelectorAll('[data-scheme]').forEach(x => x.classList.remove('active')); btn.classList.add('active'); update(); });
  el.querySelector('[data-brand-save]').onclick = async () => {
    const v = current(); if (!/^#[a-f\d]{6}$/i.test(v.brand_hex)) return G.toast('Brand color must be #RRGGBB', 'bad');
    if (v.support_email && !/^\S+@\S+\.\S+$/.test(v.support_email)) return G.toast('Enter a valid support email', 'bad');
    try { await G.put('/settings/branding', v); localStorage.setItem('stp_brand_scheme', v.color_scheme); document.documentElement.style.setProperty('--brand', v.brand_hex); document.querySelector('meta[name=theme-color]')?.setAttribute('content', v.brand_hex); G.toast('Branding saved', 'ok'); await showBranding(el); } catch (e) { G.err(e); }
  };
  el.querySelector('[data-brand-reset]').onclick = async () => {
    if (!await G.confirm('Reset brand fields to the original operator values shown when this screen was opened?', { ok: 'Reset' })) return;
    const vals = { appName: o.app_name || '', tagline: o.tagline || '', helpline: o.helpline_number || '', supportEmail: o.support_email || '', brandColor: o.brand_hex || '#2563EB', fontFamily: o.font_family || 'Poppins', pwaName: b.pwa_name || '', pwaShortName: b.pwa_short_name || '' };
    Object.entries(vals).forEach(([key, v]) => { if (field(key)) field(key).value = v; });
    el.querySelectorAll('[data-scheme]').forEach(x => x.classList.toggle('active', x.dataset.scheme === (b.color_scheme || 'Light'))); update(); G.toast('Unsaved changes discarded', '');
  };
  el.querySelector('[data-brand-preview]').onclick = () => {
    const v = current(); const temp = { operator: { ...o, app_name: v.app_name, tagline: v.tagline, helpline_number: v.helpline_number, support_email: v.support_email, brand_hex: v.brand_hex }, branding: b };
    modal({ title: 'Brand preview', subtitle: 'This preview does not change live settings', body: `<div class="stp-preview-modal">${brandPreview(temp)}</div>`, wide: true });
  };
  el.querySelectorAll('[data-asset-pick]').forEach(btn => btn.onclick = () => el.querySelector(`[data-asset-file="${btn.dataset.assetPick}"]`)?.click());
  el.querySelectorAll('[data-asset-file]').forEach(inp => inp.onchange = async () => {
    const file = inp.files?.[0]; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return G.toast('Select a PNG, JPEG or WebP image', 'bad');
    if (file.size > 1024 * 1024) return G.toast('Image must be under 1 MB', 'bad');
    try {
      const uri = await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file); });
      await G.post(`/settings/branding/assets/${inp.dataset.assetFile}`, { data_url: uri }); G.toast('Asset saved', 'ok'); await showBranding(el);
    } catch (e) { G.err(e); }
  });
  el.querySelectorAll('[data-asset-remove]').forEach(btn => btn.onclick = async () => {
    if (!await G.confirm('Remove the uploaded asset?', { danger: true, ok: 'Remove' })) return;
    try { await G.del(`/settings/branding/assets/${btn.dataset.assetRemove}`); G.toast('Asset removed', 'ok'); await showBranding(el); } catch (e) { G.err(e); }
  });
}

/* ---- Change Password (OTP sign-in: informational, as legacy) ---- */
export async function showPassword(el) {
  const html = drawTitle('Change Password', '', '', 'lock') + note('This GDS signs in using one-time passwords (OTP), not a reusable account password.') +
    card('Account security', `<p class="stp-muted">Password change is not available because no password credential is stored for this account. Your sign-in is protected by a phone OTP; request a new OTP when signing in.</p><div class="stp-savebar"><a class="stp-btn primary" href="#/settings/my-devices">${icon('phoneDevice')} Manage signed-in devices</a><button type="button" class="stp-btn" data-logout-account>Sign out</button></div>`, 'shield');
  el.innerHTML = `<div class="stp-shell">${html}</div>`;
  el.querySelector('[data-logout-account]').onclick = async () => { if (!await G.confirm('Sign out of this account?', { ok: 'Sign out' })) return; await logout(); setKey(""); localStorage.removeItem("viewAs"); location.hash = ''; location.reload(); };
}

/* ---- My devices ---- */
export async function showDevices(el) {
  const { sessions, has_legacy_session } = await G.get('/auth/sessions');
  const html = drawTitle('My devices', '', '', 'phoneDevice') + note('Active sign-in sessions for your account. Sign out devices you do not recognize.') +
    card('Signed-in devices', `<div class="stp-simple-list">${sessions.map(s => `<div class="stp-simple-row"><div><b>${escV(s.user_agent || 'Unknown browser')}${s.current ? ' · This device' : ''}</b><small>Signed in: ${DATES(s.created_at)} · Last seen: ${DATES(s.last_seen)}</small></div><button class="stp-btn ${s.current ? '' : 'stp-danger'}" type="button" data-revoke-session="${s.id}">${s.current ? 'Sign out here' : 'Sign out device'}</button></div>`).join('') || '<p>No tracked sessions. Sign in again to register this device.</p>'}${has_legacy_session ? '<p class="stp-muted">This is a legacy session; sign out and in again to enable device management.</p>' : ''}</div>`, 'phoneDevice');
  el.innerHTML = `<div class="stp-shell">${html}</div>`;
  el.querySelectorAll('[data-revoke-session]').forEach(btn => btn.onclick = async () => {
    if (!await G.confirm('Sign out this device?', { danger: true, ok: 'Sign out' })) return; try {
      const data = await G.del(`/auth/sessions/${btn.dataset.revokeSession}`); if (data.current) { await logout(); setKey(""); localStorage.removeItem("viewAs"); location.hash = ''; location.reload(); } else { G.toast('Device signed out', 'ok'); await showDevices(el); }
    } catch (e) { G.err(e); }
  });
}

/** legacy settings-complete screen(): stp-root wrapper, loading + retry panel. */
export async function mountStp(el, show) {
  el.className = 'stp-root'; el.innerHTML = '<div class="stp-shell"><div class="stp-empty-panel"><h3>Loading settings…</h3></div></div>';
  try { await show(el); }
  catch (e) { el.innerHTML = `<div class="stp-shell">${drawTitle('Settings')}${emptyPanel('Unable to load settings', e.message, 'info')}<button class="stp-btn" data-retry-settings>Retry</button></div>`; el.querySelector('[data-retry-settings]')?.addEventListener('click', () => mountStp(el, show)); G.err(e); }
}
