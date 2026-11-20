// Settings: operator profile, telephony, OTA commission, loyalty, seat upgrades, holds, branches, IAM, notifications, speed dials.
(function () {
  G.screens.settings = async (el, p) => {
    const tab = p.tab || 'profile';
    el.innerHTML = `${G.tabs([['profile', 'Operator profile'], ['calling', 'Calling'], ['commission', 'OTA commission'], ['loyalty', 'Loyalty & miles'], ['upgrades', 'Seat upgrades'], ['holds', 'Seat holds'], ['branches', 'Branches'], ['users', 'Users', 'iam.manage_users'], ['roles', 'Roles', 'iam.manage_roles'], ['notifications', 'Notifications'], ['speeddial', 'Speed dial']], tab, (k) => `#/settings/${k}`)}<div class="card" data-body></div>`;
    const body = $('[data-body]', el);
    const S = await G.get('/settings');
    const ed = can('settings.modify');
    const put = async (key, val, msg = 'Settings saved') => { await G.put(`/settings/${key}`, val); G.toast(msg, 'ok'); G.screens.settings(el, p); };
    const formBlock = (fields, key, map = (v) => v) => { body.innerHTML = `<form class="grid g3" data-f>${fields.map(G.field).join('')}</form>${ed ? '<button class="btn p" data-save style="margin-top:12px">Save</button>' : ''}`; const b = $('[data-save]', body); if (b) b.onclick = () => put(key, map(G.formVal($('[data-f]', body)))).catch(G.err); };
    const o = S.operator;

    if (tab === 'profile') formBlock([['operator_name', 'Operator name'], ['app_name', 'App name'], ['tagline', 'Tagline'], ['helpline_number', 'Helpline'], ['support_email', 'Support email'], ['customer_central_number', 'Customer central no.'], ['emergency_phone', 'Emergency phone'], ['escalation_contacts', 'Escalation contacts'], ['gst_number', 'GSTIN'], ['gst_registration_name', 'GST registered name'], ['brand_hex', 'Brand colour (#hex)'], ['font_family', 'Font'], ['logo_url', 'Logo URL']].map(([name, label]) => ({ name, label, value: o[name] })).concat([{ name: 'is_gst_receivable', label: 'GST receivable (sec 9(5) not applicable)', type: 'checkbox', value: o.is_gst_receivable }]), 'operator', (v) => { if (v.brand_hex) document.documentElement.style.setProperty('--brand', v.brand_hex); return v; });

    if (tab === 'calling') formBlock([['outgoing_number', 'Outgoing number', 'text'], ['cloud_calling_enabled', 'Cloud calling', 'checkbox'], ['is_number_masking_enabled', 'Number masking', 'checkbox'], ['direct_to_vehicle', 'Route passenger calls to vehicle phone', 'checkbox'], ['is_driver_gps_required', 'Require driver phone GPS', 'checkbox'], ['vehicle_number_as_driver_contact', 'Share vehicle number as driver contact', 'checkbox'], ['driver_personal_numbers_enabled', 'Allow driver personal numbers', 'checkbox']].map(([name, label, type]) => ({ name, label, type, value: o[name] })), 'operator');

    if (tab === 'commission') { const c = o.ota_commission || {}; formBlock(Object.keys(c).map((k) => ({ name: k, label: `${k} %`, type: 'number', step: 'any', value: c[k] })).concat([{ name: '__new', label: 'Add channel (name)' }]), 'operator', (v) => { const n = v.__new; delete v.__new; if (n) v[n.toLowerCase()] = 0; return { ota_commission: v }; }); }

    if (tab === 'loyalty') {
      const m = S.miles; const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      body.innerHTML = `<h3>Miles programme</h3><form class="grid g3" data-f>${[{ name: 'is_active', label: 'Programme active', type: 'checkbox', value: m.is_active }, { name: 'miles_to_rupee_ratio', label: '₹ per mile', type: 'number', step: 'any', value: m.miles_to_rupee_ratio }, { name: 'max_discount_percent', label: 'Max discount % of fare', type: 'number', value: m.max_discount_percent }, { name: 'min_redeemable_miles', label: 'Min redeemable miles', type: 'number', value: m.min_redeemable_miles }, { name: 'min_booking_amount', label: 'Min booking amount', type: 'number', value: m.min_booking_amount }].map(G.field).join('')}</form>${ed ? '<button class="btn p" data-save1>Save</button>' : ''}
        <h3 style="margin-top:16px">Redemption rate by day</h3><div class="row">${days.map((d, i) => { const r = S.day_rates.find((x) => x.day_of_week === i); return `<label class="f" style="width:90px">${d}<input type="number" data-dr="${i}" value="${r?.redemption_rate ?? 100}"/></label>`; }).join('')}</div>${ed ? '<button class="btn p" data-save2>Save day rates</button>' : ''}
        <h3 style="margin-top:16px">Tier multipliers</h3><div class="row">${S.tier_multipliers.map((t, i) => `<label class="f" style="width:120px">${esc(t.tier_name)}<input type="number" step="any" data-tm="${i}" value="${t.multiplier}"/></label>`).join('')}</div>${ed ? '<button class="btn p" data-save3>Save tiers</button>' : ''}
        <h3 style="margin-top:16px">Blackout dates</h3><p>${S.blackout_dates.map((d) => `<span class="badge">${fdate(d.date || d)} <a href="#" data-rmbd="${esc(d.date || d)}">✕</a></span>`).join(' ') || '<span class="muted">None</span>'}</p>${ed ? '<div class="row"><input type="date" data-bd/><button class="btn sm" data-addbd>Add</button></div>' : ''}`;
      const b = (s, f) => { const x = $(s, body); if (x) x.onclick = (e) => { e.preventDefault(); f().catch(G.err); }; };
      b('[data-save1]', () => put('miles', G.formVal($('[data-f]', body))));
      b('[data-save2]', () => put('day_rates', $$('[data-dr]', body).map((x) => ({ day_of_week: Number(x.dataset.dr), redemption_rate: Number(x.value) }))));
      b('[data-save3]', () => put('tier_multipliers', S.tier_multipliers.map((t, i) => ({ ...t, multiplier: Number($(`[data-tm="${i}"]`, body).value) }))));
      b('[data-addbd]', () => { const v = $('[data-bd]', body).value; return v ? put('blackout_dates', [...S.blackout_dates, v]) : Promise.resolve(); });
      G.on(body, 'click', '[data-rmbd]', (x, e) => { e.preventDefault(); return put('blackout_dates', S.blackout_dates.filter((d) => (d.date || d) !== x.dataset.rmbd)); });
    }

    if (tab === 'upgrades') { const u = S.seat_upgrade_policy; body.innerHTML = `<form class="grid g3" data-f>${[{ name: 'enabled', label: 'Offer paid seat upgrades', type: 'checkbox', value: u.enabled }, { name: 'auto_apply_when_free', label: 'Auto-upgrade when seat is free', type: 'checkbox', value: u.auto_apply_when_free }, { name: 'default_consent', label: 'Default consent', type: 'select', options: ['opt_in', 'opt_out'], value: u.default_consent }, { name: 'max_offers_per_trip', label: 'Max offers per trip', type: 'number', value: u.max_offers_per_trip }].map(G.field).join('')}</form><h3 style="margin-top:12px">Offer windows</h3>${G.autoTable(u.windows)}<p class="small muted">Fare class map: ${esc(JSON.stringify(u.fare_class_map))}</p>${ed ? '<button class="btn p" data-save>Save</button>' : ''}`; const s = $('[data-save]', body); if (s) s.onclick = () => put('seat_upgrade_policy', G.formVal($('[data-f]', body))).catch(G.err); }

    if (tab === 'holds') formBlock([{ name: 'default_minutes', label: 'Default hold (minutes)', type: 'number', value: S.hold_settings.default_minutes }, { name: 'max_minutes', label: 'Max hold (minutes)', type: 'number', value: S.hold_settings.max_minutes }], 'hold_settings');

    if (tab === 'branches') {
      const { cities } = await G.get('/cities');
      body.innerHTML = `<div class="row between"><b>Branches</b>${ed ? '<button class="btn sm p" data-new>+ Branch</button>' : ''}</div>${G.table(S.branches, [{ k: 'name', l: 'Name' }, { l: 'City', f: (b) => esc(cities.find((c) => c.id == b.city_id)?.name || '') }, { k: 'address', l: 'Address' }, { k: 'phone', l: 'Phone' }, { l: '', f: (b) => (ed ? `<button class="btn sm d" data-rm="${b.id}">✕</button>` : '') }])}`;
      const nb = $('[data-new]', body); if (nb) nb.onclick = async () => { const v = await G.prompt('New branch', [{ name: 'name', label: 'Name', required: true }, { name: 'city_id', label: 'City', type: 'select', options: cities.map((c) => [c.id, c.name]) }, { name: 'phone', label: 'Phone' }, { name: 'address', label: 'Address', full: 1 }]); if (v) { await G.post('/branches', { ...v, city_id: Number(v.city_id) }); G.screens.settings(el, p); } };
      G.on(body, 'click', '[data-rm]', async (b) => { if (await G.confirm('Delete branch?', { danger: 1 })) { await G.del(`/branches/${b.dataset.rm}`); G.screens.settings(el, p); } });
    }

    if (tab === 'users') {
      const [U, R] = await Promise.all([G.get('/iam/users'), G.get('/iam/roles')]);
      const roleOpts = R.roles.map((r) => [r.key, r.name]);
      body.innerHTML = `<div class="row between"><b>${U.length} users</b><button class="btn sm p" data-new>+ Invite user</button></div>${G.table(U, [{ l: 'Name', f: (u) => `<b>${esc(u.name)}</b><div class="small muted">${esc(u.email || '')}</div>` }, { k: 'phone', l: 'Phone' }, { l: 'Role', f: (u) => esc(R.roles.find((r) => r.key === u.role)?.name || u.role) }, { l: 'Branch', f: (u) => esc(S.branches.find((b) => b.id == u.branch_id)?.name || '—') }, { l: 'Permissions', n: 1, f: (u) => u.permissions.length }, { l: 'Status', f: (u) => statusBadge(u.status) }, { l: '', f: (u) => (u.role === 'owner' ? '' : `<button class="btn sm" data-ed="${u.id}">Edit</button> <button class="btn sm ${u.status === 'ACTIVE' ? 'd' : ''}" data-st="${u.id}|${u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}">${u.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>`) }])}`;
      const form = (u = {}) => [{ name: 'name', label: 'Name', required: true, value: u.name }, { name: 'phone', label: 'Mobile', required: true, value: u.phone }, { name: 'email', label: 'Email', value: u.email }, { name: 'role', label: 'Role', type: 'select', options: roleOpts, value: u.role }, { name: 'branch_id', label: 'Branch', type: 'select', options: [['', '—'], ...S.branches.map((b) => [b.id, b.name])], value: u.branch_id }, { name: 'commission_pct', label: 'Agent commission %', type: 'number', value: u.commission_pct }];
      const norm = (v) => ({ ...v, branch_id: v.branch_id ? Number(v.branch_id) : null });
      $('[data-new]', body).onclick = async () => { const v = await G.prompt('Invite user', form()); if (v) { await G.post('/iam/users', norm(v)); G.toast('User added — they can log in with OTP', 'ok'); G.screens.settings(el, p); } };
      G.on(body, 'click', '[data-ed]', async (b) => { const u = U.find((x) => x.id == b.dataset.ed); const v = await G.prompt('Edit user', form(u)); if (v) { await G.put(`/iam/users/${u.id}`, norm(v)); G.screens.settings(el, p); } });
      G.on(body, 'click', '[data-st]', async (b) => { const [id, status] = b.dataset.st.split('|'); await G.put(`/iam/users/${id}`, { status }); G.screens.settings(el, p); });
    }

    if (tab === 'roles') {
      const R = await G.get('/iam/roles'); const cur = G.query().role || R.roles[0].key; const role = R.roles.find((r) => r.key === cur) || R.roles[0];
      body.innerHTML = `<div class="row between">${G.pills(R.roles.map((r) => [r.key, `${r.name} (${r.users})`]), role.key, 'data-role')}<button class="btn sm" data-new>+ Custom role</button></div>
        <div style="margin-top:12px">${Object.entries(R.catalog).map(([area, perms]) => `<div style="margin:8px 0"><b style="text-transform:capitalize">${esc(area)}</b><div class="row" style="flex-wrap:wrap">${perms.map((pm) => `<label class="chk"><input type="checkbox" data-pm="${pm}" ${role.permissions.includes(pm) ? 'checked' : ''} ${role.key === 'owner' ? 'disabled' : ''}/> ${esc(pm.split('.')[1].replace(/_/g, ' '))}</label>`).join('')}</div></div>`).join('')}</div>
        ${role.key !== 'owner' ? `<div class="row" style="margin-top:12px"><button class="btn p" data-save>Save permissions</button>${!role.builtin ? '<button class="btn d" data-del>Delete role</button>' : ''}</div>` : '<p class="muted">Owner always has every permission.</p>'}`;
      G.on(body, 'click', '[data-role]', (b) => (location.hash = `#/settings/roles?role=${b.dataset.role}`));
      const sv = $('[data-save]', body); if (sv) sv.onclick = () => G.put(`/iam/roles/${role.key}`, { name: role.name, permissions: $$('[data-pm]', body).filter((x) => x.checked).map((x) => x.dataset.pm) }).then(() => G.toast('Role saved', 'ok')).catch(G.err);
      const dl = $('[data-del]', body); if (dl) dl.onclick = async () => { if (await G.confirm('Delete role?', { danger: 1 })) { await G.del(`/iam/roles/${role.key}`).catch(G.err); location.hash = '#/settings/roles'; } };
      $('[data-new]', body).onclick = async () => { const v = await G.prompt('Custom role', [{ name: 'name', label: 'Role name', required: true, full: 1 }]); if (!v) return; const key = v.name.toLowerCase().replace(/\W+/g, '_'); await G.put(`/iam/roles/${key}`, { name: v.name, permissions: ['trips.view'] }); location.hash = `#/settings/roles?role=${key}`; };
    }

    if (tab === 'notifications') {
      const N = await G.get('/notifications/subscriptions');
      body.innerHTML = `<div class="row between"><b>Who gets notified about what</b>${ed ? '<button class="btn sm p" data-new>+ Subscription</button>' : ''}</div>${G.table(N.subscriptions, [{ k: 'display_name', l: 'Subscriber' }, { k: 'subscriber_type', l: 'Type' }, { k: 'subscriber_ref', l: 'Ref' }, { l: 'Events', f: (s) => s.event_types.map((e) => `<span class="badge">${esc(e)}</span>`).join(' ') }, { k: 'channel', l: 'Channel' }, { l: 'On', f: (s) => `<input type="checkbox" data-tog="${s.id}" ${s.enabled ? 'checked' : ''} ${ed ? '' : 'disabled'}/>` }, { l: '', f: (s) => (ed ? `<button class="btn sm d" data-rm="${s.id}">✕</button>` : '') }])}`;
      G.on(body, 'change', '[data-tog]', (b) => G.put(`/notifications/subscriptions/${b.dataset.tog}`, { enabled: b.checked }).then(() => G.toast('Updated', 'ok')));
      G.on(body, 'click', '[data-rm]', async (b) => { await G.del(`/notifications/subscriptions/${b.dataset.rm}`); G.screens.settings(el, p); });
      const nb = $('[data-new]', body); if (nb) nb.onclick = () => {
        const m = G.modal({ title: 'New subscription', size: 'lg', body: `<form class="grid g2" data-f>${[{ name: 'display_name', label: 'Name', required: true }, { name: 'subscriber_type', label: 'Type', type: 'select', options: ['user', 'role', 'passenger', 'staff', 'phone'] }, { name: 'subscriber_ref', label: 'Ref (user id / role / phone / *)', value: '*' }, { name: 'channel', label: 'Channel', type: 'select', options: N.channels }].map(G.field).join('')}</form><div class="row" style="flex-wrap:wrap;margin-top:8px">${N.events.map((e) => `<label class="chk"><input type="checkbox" data-ev="${e}"/> ${esc(e)}</label>`).join('')}</div>`, foot: '<button class="btn p" data-ok>Create</button>' });
        m.$('[data-ok]').onclick = async () => { const v = G.formVal(m.$('[data-f]')); v.event_types = m.$$('[data-ev]').filter((x) => x.checked).map((x) => x.dataset.ev); if (!v.display_name || !v.event_types.length) return G.toast('Name and at least one event required', 'bad'); v.enabled = true; await G.post('/notifications/subscriptions', v).catch(G.err); m.close(); G.screens.settings(el, p); };
      };
    }

    if (tab === 'speeddial') {
      const D = await G.get('/speed-dials');
      body.innerHTML = `<label class="chk"><input type="checkbox" data-en ${D.settings.enabled ? 'checked' : ''}/> Speed dial enabled</label> &nbsp; <label class="chk"><input type="checkbox" data-l4 ${D.settings.bus_last4_enabled ? 'checked' : ''}/> Dial a bus by last 4 digits of its number</label>
        <div class="row between" style="margin-top:12px"><b>Codes</b>${ed ? '<button class="btn sm p" data-new>+ Code</button>' : ''}</div>${G.table(D.dials, [{ k: 'code', l: 'Code' }, { k: 'label', l: 'Label' }, { k: 'kind', l: 'Kind' }, { k: 'phone', l: 'Number' }, { l: '', f: (d) => (ed ? `<button class="btn sm d" data-rm="${d.id}">✕</button>` : '') }])}`;
      const sv = () => put('speed_dial', { enabled: $('[data-en]', body).checked, bus_last4_enabled: $('[data-l4]', body).checked }, 'Speed dial updated').catch(G.err);
      $('[data-en]', body).onchange = sv; $('[data-l4]', body).onchange = sv;
      const nb = $('[data-new]', body); if (nb) nb.onclick = async () => { const v = await G.prompt('Speed dial code', [{ name: 'code', label: 'Code (1-99)', required: true }, { name: 'label', label: 'Label', required: true }, { name: 'phone', label: 'Number', required: true }, { name: 'kind', label: 'Kind', type: 'select', options: ['number', 'staff', 'branch'] }]); if (v) { await G.post('/speed-dials', { ...v, is_active: true }); G.screens.settings(el, p); } };
      G.on(body, 'click', '[data-rm]', async (b) => { await G.del(`/speed-dials/${b.dataset.rm}`); G.screens.settings(el, p); });
    }
  };
})();
