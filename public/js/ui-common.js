/* Shared UI helpers: brand calendar popup (G.calendarPop) and minimise/restore for every popup. */
(function () {
  'use strict';
  const G = window.G = window.G || {};
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ---------- Calendar popup ---------- */
  G.calendarPop = function (anchor, value, onPick, opts = {}) {
    const open = document.querySelector('.ui-calpop');
    if (open) { const same = open._anchor === anchor; open._close ? open._close() : open.remove(); if (same) return null; }
    const pop = document.createElement('div');
    pop.className = 'ui-calpop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose date');
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.right - 320, innerWidth - 336)) + 'px';
    pop.style.top = (r.bottom + 400 > innerHeight ? Math.max(8, r.top - 396) : r.bottom + 6) + 'px';
    const td = iso(new Date());
    let cur = value ? new Date(value + 'T00:00:00') : new Date();
    if (isNaN(cur)) cur = new Date();
    cur.setDate(1);
    const draw = () => {
      const y = cur.getFullYear(), m = cur.getMonth(), start = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < start; i++) cells += '<span></span>';
      for (let d = 1; d <= days; d++) { const v = iso(new Date(y, m, d)); cells += `<button type="button" class="${v === value ? 'selected' : ''}${v === td ? ' today' : ''}" data-day="${v}">${d}</button>`; }
      pop.innerHTML = `<div class="ui-cal-head"><button type="button" data-nav="-1" aria-label="Previous month">‹</button><b>${esc(cur.toLocaleString('en-IN', { month: 'long', year: 'numeric' }))}</b><button type="button" data-nav="1" aria-label="Next month">›</button></div><div class="ui-cal-week">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((x) => `<span>${x}</span>`).join('')}</div><div class="ui-cal-grid">${cells}</div><div class="ui-cal-quick"><button type="button" data-quick="0">Today</button><button type="button" data-quick="1">Tomorrow</button><button type="button" data-quick="7">+7 days</button>${opts.clear ? '<button type="button" data-clear>Clear</button>' : ''}</div>`;
    };
    draw();
    pop._anchor = anchor;
    const close = () => { pop.remove(); document.removeEventListener('click', off, true); document.removeEventListener('keydown', key); };
    const off = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.nav) { cur.setMonth(cur.getMonth() + Number(b.dataset.nav)); draw(); return; }
      let v = null;
      if (b.dataset.day) v = b.dataset.day;
      else if (b.dataset.quick != null) { const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.quick)); v = iso(d); }
      else if (b.hasAttribute('data-clear')) v = '';
      if (v !== null) { close(); onPick(v); }
    });
    pop._close = close;
    document.body.append(pop);
    setTimeout(() => { document.addEventListener('click', off, true); document.addEventListener('keydown', key); }, 0);
    return { close };
  };

  /* ---------- Minimise / restore for all popups ---------- */
  const OVERLAY = '.ov,.rv-modal-overlay,.sx-backdrop,.vp-overlay,.ac10-overlay,.stp-modal-backdrop,.cc14-overlay,[data-modal-overlay]';
  const DIALOG = '.md,.rv-modal,.sx-modal,.stp-modal,.cc14-small-modal,[role=dialog]';
  let dock;
  const ensureDock = () => { if (!dock || !dock.isConnected) { dock = document.createElement('div'); dock.className = 'ui-min-dock'; dock.setAttribute('aria-label', 'Minimised popups'); document.body.append(dock); } return dock; };
  const titleOf = (dlg) => (dlg.querySelector('h1,h2,h3,[data-sx-modal-head] b')?.textContent || dlg.getAttribute('aria-label') || 'Popup').trim().replace(/\s+/g, ' ').slice(0, 40);
  function enhance(ov) {
    if (!(ov instanceof HTMLElement) || !ov.isConnected || ov.classList.contains('ui-calpop')) return;
    const dlg = ov.matches(DIALOG) ? ov : ov.querySelector(DIALOG);
    if (!dlg) return;
    if (dlg.querySelector('.ui-min-btn')) return;
    const head = dlg.querySelector(':scope > header, :scope > .hd, header, .hd');
    if (!head) return;
    ov.dataset.uiMin = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-min-btn';
    btn.title = 'Minimise';
    btn.setAttribute('aria-label', 'Minimise popup');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
    const closeBtn = head.querySelector('[data-x],[data-rv-modal-close],[data-sx-close],.close,button[aria-label*="lose" i]');
    if (closeBtn && closeBtn.parentNode) closeBtn.parentNode.insertBefore(btn, closeBtn); else head.append(btn);
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (ov.classList.contains('ui-minimised')) return;
      ov.classList.add('ui-minimised');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ui-min-chip';
      chip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 4h16v16H4z"/></svg><span>${esc(titleOf(dlg))}</span>`;
      chip.title = 'Restore';
      chip.onclick = () => { ov.classList.remove('ui-minimised'); chip.remove(); };
      chip._ov = ov;
      ensureDock().append(chip);
    });
  }
  const scan = (n) => { if (!(n instanceof HTMLElement)) return; if (n.matches(OVERLAY)) enhance(n); n.querySelectorAll?.(OVERLAY).forEach(enhance); };
  const start = () => {
    document.querySelectorAll(OVERLAY).forEach(enhance);
    let queued = false;
    const sweep = () => { queued = false; document.querySelectorAll(OVERLAY).forEach(enhance); document.querySelectorAll('.ui-min-chip').forEach((c) => { if (!c._ov || !c._ov.isConnected) c.remove(); }); };
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(sweep); } }).observe(document.body, { childList: true, subtree: true });
  };
  void scan; void start; /* minimise disabled: popups keep only Close */

  /* ---------- Standard custom dropdown (wraps a native <select>) ---------- */
  G.niceSelect = function (sel) {
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
  };
  /* ---------- Standard date button (wraps a native date input) ---------- */
  const fmtD = (v) => { const d = v ? new Date(v + 'T00:00:00') : null; return d && !isNaN(d) ? d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : 'Select date'; };
  G.niceDate = function (inp) {
    if (!inp || inp._niceDate) return; inp._niceDate = true;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-date-btn'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', inp.getAttribute('aria-label') || 'Choose date');
    const paint = () => { b.innerHTML = `<span>${esc(fmtD(inp.value))}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`; };
    paint(); inp.classList.add('ui-dd-native'); inp.after(b); inp.addEventListener('change', paint);
    const host = inp.closest('label') || b;
    host.addEventListener('click', (e) => { if (e.target.closest('.ui-calpop')) return; e.preventDefault(); e.stopPropagation(); G.calendarPop(host, inp.value, (v) => { inp.value = v; paint(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }); });
  };
  /* ---------- All services list for service filters ---------- */
  let svcCache = null;
  G.serviceList = () => svcCache || (svcCache = G.get('/routes?status=all').then((r) => (r.routes || []).map((x) => [String(x.service_number || x.id), `${x.service_number || ''}${x.name || x.service_name ? ' · ' + (x.name || x.service_name) : ''}`])).catch(() => { svcCache = null; return []; }));
  const fillServices = (sel) => {
    if (sel._svcFilled) return; sel._svcFilled = true;
    G.serviceList().then((list) => {
      const have = new Set([...sel.options].map((o) => o.value)); const cur = sel.value;
      list.forEach(([v, t]) => { if (!have.has(v)) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); } });
      sel.value = cur; sel.dispatchEvent(new Event('ui:refresh'));
    });
  };
  const ddSweep = () => {
    document.querySelectorAll('.vp-select select,.sp-filter select,.ac10-select select,select[data-nice]').forEach(G.niceSelect);
    document.querySelectorAll('.ac10-root select[name=service]').forEach(fillServices);
    document.querySelectorAll('.ac10-date input[type=date],input[type=date][data-nice]').forEach(G.niceDate);
  };
  const subH = () => { const sub = document.querySelector('[data-sub]'); document.documentElement.style.setProperty('--sub-h', (sub && sub.offsetHeight ? sub.offsetHeight : 0) + 'px'); };
  const ddStart = () => { ddSweep(); subH(); addEventListener('resize', subH); setInterval(subH, 1000); let q = false; new MutationObserver(() => { if (!q) { q = true; requestAnimationFrame(() => { q = false; ddSweep(); }); } }).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) ddStart(); else document.addEventListener('DOMContentLoaded', ddStart);
})();
