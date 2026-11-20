// Core: API client, state, router, UI primitives.
const G = (window.G = { user: null, operator: null, routes: {}, screens: {}, viewAs: localStorage.getItem('viewAs') || '' });

G.api = async function (method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = localStorage.getItem('token'); if (tok) headers.Authorization = `Bearer ${tok}`;
  if (G.viewAs) headers['x-view-as'] = G.viewAs;
  const res = await fetch('/api' + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && !url.startsWith('/auth/')) { localStorage.removeItem('token'); location.hash = '#/login'; throw new Error('Session expired'); }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) { const e = new Error((data && data.message) || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
};
G.get = (u) => G.api('GET', u); G.post = (u, b) => G.api('POST', u, b || {}); G.put = (u, b) => G.api('PUT', u, b || {}); G.del = (u) => G.api('DELETE', u); G.patch = (u, b) => G.api('PATCH', u, b || {});
G.download = async (url, name) => { const tok = localStorage.getItem('token'); const r = await fetch('/api' + url, { headers: { Authorization: `Bearer ${tok}` } }); const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n, d = 0) => (n == null || isNaN(n) ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })}`);
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const pct = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fdate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fdt = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const t12 = (hhmm) => { if (!hhmm) return '—'; const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const can = (p) => !!G.user && G.user.permissions.includes(p);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const statusBadge = (s) => { const m = { confirmed: 'ok', active: 'ok', paid: 'ok', approved: 'b', matched: 'ok', boarded: 'ok', dropped: 'ok', checked_in: 'b', live: 'b', hold: 'warn', pending: 'warn', draft: 'warn', disabled: 'bad', cancelled: 'bad', no_show: 'bad', mismatched: 'warn', unmatched_ota: 'bad', expired: 'bad', rejected: 'bad', released: 'bad', missed: 'bad', answered: 'ok', EXPIRED: 'bad', 'EXPIRING SOON': 'warn', inactive: 'bad', INACTIVE: 'bad', ACTIVE: 'ok', recovered: 'ok', disbursed: 'warn', completed: '' }; return `<span class="badge ${m[s] ?? ''}">${esc(String(s ?? '—').replace(/_/g, ' '))}</span>`; };
Object.assign(window, { esc, inr, num, pct, today, addDays, fdate, fdt, t12, can, $, $$, statusBadge });

// ---------- toast / modal ----------
G.toast = (msg, kind = '') => { const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3500); };
G.err = (e) => G.toast(e.message || String(e), 'bad');
G.modal = function ({ title, body, size = '', foot = '', onMount }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="md ${size}"><div class="hd"><h2>${title}</h2><button class="btn ghost sm" data-x>✕</button></div><div class="bd">${body}</div>${foot ? `<div class="ft">${foot}</div>` : ''}</div>`;
  const close = () => ov.remove();
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  $('[data-x]', ov).onclick = close;
  $('#modal-root').appendChild(ov);
  const api = { el: ov, close, $: (s) => $(s, ov), $$: (s) => $$(s, ov) };
  onMount && onMount(api);
  return api;
};
G.confirm = (msg, { ok = 'Confirm', danger } = {}) => new Promise((res) => { const m = G.modal({ title: 'Please confirm', body: `<p>${msg}</p>`, foot: `<button class="btn" data-n>Cancel</button><button class="btn ${danger ? 'd' : 'p'}" data-y>${ok}</button>` }); m.$('[data-n]').onclick = () => { m.close(); res(false); }; m.$('[data-y]').onclick = () => { m.close(); res(true); }; });
G.prompt = (title, fields, { ok = 'Save', size } = {}) => new Promise((res) => {
  const m = G.modal({ title, size, body: `<form class="grid g2" data-f>${fields.map(G.field).join('')}</form>`, foot: `<button class="btn" data-n>Cancel</button><button class="btn p" data-y>${ok}</button>` });
  m.$('[data-n]').onclick = () => { m.close(); res(null); };
  m.$('[data-y]').onclick = () => { const v = G.formVal(m.$('[data-f]')); for (const f of fields) if (f.required && (v[f.name] === '' || v[f.name] == null)) return G.toast(`${f.label} is required`, 'bad'); m.close(); res(v); };
});
G.field = (f) => {
  const v = f.value ?? ''; const span = f.full ? 'style="grid-column:1/-1"' : '';
  if (f.type === 'select') return `<label class="f" ${span}>${esc(f.label)}<select name="${f.name}">${f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select></label>`;
  if (f.type === 'textarea') return `<label class="f" ${span}>${esc(f.label)}<textarea name="${f.name}" rows="${f.rows || 3}">${esc(v)}</textarea></label>`;
  if (f.type === 'checkbox') return `<label class="chk" ${span}><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}/> ${esc(f.label)}</label>`;
  return `<label class="f" ${span}>${esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.step ? `step="${f.step}"` : ''}/></label>`;
};
G.formVal = (form) => { const o = {}; for (const el of $$('input,select,textarea', form)) { if (!el.name) continue; if (el.type === 'checkbox') o[el.name] = el.checked; else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value); else o[el.name] = el.value; } return o; };

// Generic table: cols = [{k,l,f?:(row)=>html,n?:bool}]
G.table = (rows, cols, { empty = 'No records', rowAttr } = {}) => (!rows || !rows.length ? `<div class="empty">${empty}</div>` : `<div class="tw"><table class="t"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'n' : ''}">${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr ${rowAttr ? rowAttr(r, i) : ''}>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${c.f ? c.f(r, i) : esc(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
G.kpis = (items) => `<div class="grid g${Math.min(items.length, 5)}">${items.map(([l, v, s]) => `<div class="kpi"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}</div>`;
G.tabs = (items, cur, href) => `<div class="tabs">${items.filter((x) => !x[2] || can(x[2])).map(([k, l]) => `<a class="${k === cur ? 'on' : ''}" href="${href(k)}">${esc(l)}</a>`).join('')}</div>`;
G.pills = (items, cur, attr) => `<div class="pills">${items.map(([k, l]) => `<a class="${k === cur ? 'on' : ''}" ${attr}="${k}">${esc(l)}</a>`).join('')}</div>`;
G.range = (from, to) => `<input type="date" data-from value="${from}"/><span class="muted">to</span><input type="date" data-to value="${to}"/>`;
G.bars = (vals, labels, fmt = num) => { const mx = Math.max(1, ...vals); return `<div class="bars">${vals.map((v, i) => `<div style="height:${(v / mx) * 100}%" title="${esc(labels[i])}: ${fmt(v)}"></div>`).join('')}</div>`; };
G.query = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
G.qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

// Wrap async handler with error toast. Idempotent per (element, event, selector) so screens can re-render safely.
G.on = (el, ev, sel, fn) => { const reg = (el._gon ||= {}); const key = `${ev}|${sel}`; if (reg[key]) el.removeEventListener(ev, reg[key]); reg[key] = (e) => { const t = e.target.closest(sel); if (t && el.contains(t)) Promise.resolve(fn(t, e)).catch(G.err); }; el.addEventListener(ev, reg[key]); };

// Step-up OTP helper
G.stepUp = async (purpose, url = '/auth/step-up') => { const r = await G.post(url, { purpose }); const v = await G.prompt('Verify OTP', [{ name: 'otp', label: `Enter the OTP sent to ${G.user.phone}${r.dev_hint ? ` (dev: ${r.dev_hint})` : ''}`, required: true, full: true }], { ok: 'Verify' }); return v && v.otp; };
