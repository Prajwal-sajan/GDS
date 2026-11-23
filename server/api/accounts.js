// Accounts: analytics, transactions, receivables, ledgers, reports, invoices, OTA reconciliation, coupons.
const express = require('express');
const db = require('../db');
const U = require('../util');
const D = require('../domain');
const Rp = require('../reports');
const { can } = require('../auth');

const r = express.Router();
const Policy=require('../access-runtime-v27');
const h = (fn) => (req, res) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { res.status(e.status || 500).json({ success: false, message: e.message }); } };
const range = (q) => ({ from: q.from || q.from_date || U.addDays(U.today(), -6), to: q.to || q.to_date || U.today() });
const toCsv = (rows) => { if (!rows.length) return ''; const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object'); return [cols.join(','), ...rows.map((r2) => cols.map((c) => `"${String(r2[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); };
const sendCsv = (res, name, rows) => { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); res.send(toCsv(rows)); };

r.get('/accounts/sales-facets', can('accounts.view'), h(() => {
  const routes=db.col('routes').filter(r=>r.status!=='deleted');
  const sectors=new Map();
  const services=routes.map(r=>{
    const sector=String(r.origin_city_id)+':'+String(r.destination_city_id);
    if(!sectors.has(sector))sectors.set(sector,{value:sector,label:D.cityName(r.origin_city_id)+' → '+D.cityName(r.destination_city_id)});
    return {value:String(r.id),sector,label:r.service_number+(r.name&&r.name!==r.service_number?' · '+r.name:'')};
  }).sort((a,b)=>a.label.localeCompare(b.label));
  return {sectors:[...sectors.values()].sort((a,b)=>a.label.localeCompare(b.label)),
    services, channels:[...new Set(db.col('bookings').all().map(b=>b.source).filter(Boolean))].sort()};
}));
r.get('/accounts/analytics', can('accounts.view'), h((req) => Rp.analytics({ ...range(req.query), basis: req.query.basis, source: req.query.source || 'all', sector:req.query.sector || 'all', service:req.query.service || 'all' })));
r.get('/accounts/transactions', can('accounts.view'), h((req, res) => { const rows = Rp.transactions({ ...range(req.query), source: req.query.source, search: req.query.q || '', user: req.user }); if (req.query.format === 'csv') { Policy.explicitAccess(req,'Export / download'); return sendCsv(res, `transactions_${req.query.from}_${req.query.to}`, rows); } return { rows, totals: { bookings: rows.filter((x) => x.type === 'booking').length, amount: U.round2(U.sum(rows, (x) => x.total)), refunds: U.round2(U.sum(rows, (x) => x.refund || 0)) } }; }));
r.get('/accounts/receivables', can('accounts.view'), h((req, res) => { const out = Rp.receivables(range(req.query)); if (req.query.format === 'csv') { Policy.explicitAccess(req,'Export / download'); return sendCsv(res, 'receivables', out.rows); } return out; }));
r.get('/accounts/ledger', can('accounts.ledger'), h((req) => Rp.ledger(req.query.channel_key)));
r.post('/accounts/ledger', can('accounts.ledger'), h((req) => { const b = req.body; if (!b.channel_key || !(Number(b.amount) > 0)) throw D.httpErr(400, 'Channel and amount required'); return db.col('ledger').insert({ channel_key: b.channel_key, channel_type: b.channel_key.split(':')[0], type: b.type === 'debit' ? 'debit' : 'credit', amount: Number(b.amount), note: b.note || '', date: b.date || U.today(), by: req.user.name }); }));
r.delete('/accounts/ledger/:id', can('accounts.ledger'), h((req) => ({ success: db.col('ledger').remove(req.params.id) })));
r.get('/accounts/channels', can('accounts.view'), h(() => ({ agents: db.col('users').filter((u) => u.role === 'agent').map((u) => ({ channel_key: `agent:${u.phone}`, id: u.id, name: u.name, phone: u.phone, commission_pct: u.commission_pct, credit_limit: u.credit_limit, is_active: u.status !== 'INACTIVE', ...(u.agent_terms || {}) })), branches: db.col('users').filter((u) => ['booking_executive', 'manager', 'owner'].includes(u.role)).map((u) => ({ channel_key: `branch:${u.phone}`, name: u.name })), otas: ['redbus', 'abhibus', 'paytm'].map((o) => ({ channel_key: `ota:${o}`, name: o })) })));
// Agent financial terms (commission, credit, settlement). Creates the agent user when the phone is new.
r.put('/accounts/channels/agents', can('accounts.reconciliation'), h((req) => {
  const b = req.body || {}; const phone = String(b.phone || '').trim(); const num = (x, d = 0) => (x === undefined || x === '' ? d : Number(x));
  if (!/^\d{10}$/.test(phone)) throw D.httpErr(400, 'Agent phone must be 10 digits');
  if (!String(b.name || '').trim()) throw D.httpErr(400, 'Agent name required');
  const pct = num(b.commission_pct); if (!(pct >= 0 && pct <= 100)) throw D.httpErr(400, 'Commission must be 0–100%');
  for (const k of ['balance', 'credit_limit', 'settlement_cycle_days', 'tax_on_fare_percent', 'tds_percent', 'gst_on_commission_percent', 'match_tolerance']) if (num(b[k]) < 0) throw D.httpErr(400, `${k.replace(/_/g, ' ')} cannot be negative`);
  const terms = { balance: num(b.balance), settlement_cycle_days: num(b.settlement_cycle_days, 7), commission_base: b.commission_base === 'fare_plus_gst' ? 'fare_plus_gst' : 'fare_only', settlement_mode: ['DOJ', 'DOB', 'weekly'].includes(b.settlement_mode) ? b.settlement_mode : 'DOJ', tax_on_fare_percent: num(b.tax_on_fare_percent), tds_percent: num(b.tds_percent), gst_on_commission_percent: num(b.gst_on_commission_percent, 18), match_tolerance: num(b.match_tolerance, 1), independent_commission: !!b.independent_commission };
  const status = b.is_active === false || b.is_active === 'false' ? 'INACTIVE' : 'ACTIVE';
  let u = db.col('users').find((x) => x.phone === phone);
  if (u && u.role !== 'agent') throw D.httpErr(409, 'This phone belongs to a non-agent user');
  if (u) u = db.col('users').update(u.id, { name: String(b.name).trim(), commission_pct: pct, credit_limit: num(b.credit_limit), status, agent_terms: terms });
  else u = db.col('users').insert({ phone, name: String(b.name).trim(), role: 'agent', status, commission_pct: pct, credit_limit: num(b.credit_limit), agent_terms: terms, branch_id: null });
  D.audit('user', u.id, 'agent_terms', { op: 'update', commission_pct: pct }, req.user);
  return { channel_key: `agent:${u.phone}`, id: u.id, name: u.name, phone: u.phone, commission_pct: u.commission_pct, credit_limit: u.credit_limit, is_active: u.status !== 'INACTIVE', ...terms };
}));

r.get('/accounts/reports', can('accounts.reports'), h(() => ({ reports: Object.keys(Rp.REPORTS) })));
r.get('/accounts/reports/:key', can('accounts.reports'), h((req, res) => {
  const f = Rp.REPORTS[req.params.key]; if (!f) throw D.httpErr(404, 'Unknown report');
  const out = f({ ...req.query, ...range(req.query) });
  const op = db.meta('operator');
  if (req.query.format === 'csv') { Policy.explicitAccess(req,'Export / download'); return sendCsv(res, `${req.params.key}_${range(req.query).from}_${range(req.query).to}`, out.rows || out.boarding || out.services || out.categories || out.ranking || []); }
  return { report: req.params.key, ...range(req.query), operator_name: op.operator_name, ...out };
}));

r.get('/accounts/documents', can('accounts.ledger'), h(() => ({ documents: db.col('invoices').all().sort((a, b) => b.date.localeCompare(a.date)), balance: (() => { const os = db.col('invoices').filter((i) => i.kind === 'operator').sort((a, b) => b.date.localeCompare(a.date))[0]; const paid = U.sum(db.col('invoice_payments').all(), (p) => p.amount); return { statement: os?.name, closing_balance: os?.amount || 0, paid_since: paid, balance: U.round2((os?.amount || 0) - paid) }; })() })));
r.post('/accounts/documents/pay', can('accounts.ledger'), (_req,res)=>res.status(405).json({message:'Use payment reference submission against a platform-issued statement.'}));

// ---------- OTA reconciliation ----------
r.get('/reconciliation/config', can('accounts.reconciliation'), h(() => db.meta('reconciliation_config') || []));
r.put('/reconciliation/config', can('accounts.reconciliation'), h((req) => { db.meta('reconciliation_config', req.body); const op = db.meta('operator'); op.ota_commission = { ...op.ota_commission, ...Object.fromEntries(req.body.map((c) => [c.ota_slug, Number(c.commission_percent)])) }; db.meta('operator', op); return req.body; }));
r.get('/reconciliation/settlements', can('accounts.reconciliation'), h(() => ({ imports: db.col('settlements').all().slice().reverse() })));
r.post('/reconciliation/settlements', can('accounts.reconciliation'), h((req) => {
  // body: { ota_slug, file_name, csv }  — csv columns: pnr,fare,commission,payout[,type]
  const { ota_slug, file_name, csv } = req.body; if (!ota_slug || !csv) throw D.httpErr(400, 'Select OTA and upload a CSV');
  const lines = csv.trim().split(/\r?\n/); const head = lines.shift().toLowerCase().split(',').map((x) => x.trim().replace(/"/g, ''));
  const idx = (k) => head.findIndex((x) => x.includes(k));
  const cfg = (db.meta('reconciliation_config') || []).find((c) => c.ota_slug === ota_slug) || { commission_percent: 0, gst_on_commission_percent: 18, tds_percent: 0.1 };
  const rows = lines.map((l) => l.split(',').map((x) => x.trim().replace(/"/g, ''))).map((c) => ({ pnr: c[idx('pnr')], fare: Number(c[idx('fare')]) || 0, commission: Number(c[idx('commission')]) || 0, payout: Number(c[idx('payout')]) || 0, type: c[idx('type')] || 'booking' }));
  const lines2 = rows.map((row) => {
    const b = db.col('bookings').find((x) => x.pnr === row.pnr || x.ticket_number === row.pnr);
    if (!b) return { ...row, status: 'unmatched_ota', reason: 'Not found in your GDS' };
    const expFare = b.fare.net; const expComm = U.round2(expFare * cfg.commission_percent / 100); const expPayout = U.round2(b.fare.total - expComm - expComm * cfg.gst_on_commission_percent / 100 - expFare * cfg.tds_percent / 100);
    const diffs = []; if (Math.abs(expFare - row.fare) > 1) diffs.push('Fare mismatch'); if (Math.abs(expComm - row.commission) > 1) diffs.push('Commission rate differs'); if (Math.abs(expPayout - row.payout) > 1) diffs.push('Payout differs');
    return { ...row, booking_status: b.status, expected_fare: expFare, expected_commission: expComm, expected_payout: expPayout, difference: U.round2(row.payout - expPayout), status: diffs.length ? 'mismatched' : 'matched', reason: diffs.join(', ') };
  });
  const imp = db.col('settlements').insert({ ota_slug, file_name: file_name || 'upload.csv', status: 'matched', total_lines_parsed: lines2.length, matched_count: lines2.filter((x) => x.status === 'matched').length, mismatched_count: lines2.filter((x) => x.status === 'mismatched').length, unmatched_ota_count: lines2.filter((x) => x.status === 'unmatched_ota').length, ota_payout: U.round2(U.sum(lines2, (x) => x.payout)), our_expected: U.round2(U.sum(lines2, (x) => x.expected_payout || 0)), lines: lines2, uploaded_by: req.user.name });
  imp.difference = U.round2(imp.ota_payout - imp.our_expected); db.persist();
  return imp;
}));
r.get('/reconciliation/settlements/:id', can('accounts.reconciliation'), h((req) => db.col('settlements').get(req.params.id)));
r.post('/reconciliation/settlements/:id/resolve', can('accounts.reconciliation'), h((req) => { const s = db.col('settlements').get(req.params.id); for (const l of s.lines || []) if (!req.body.pnrs || req.body.pnrs.includes(l.pnr)) if (l.status !== 'matched') l.resolution = req.body.action; db.persist(); return s; }));

// ---------- Coupons ----------
r.get('/coupons', can('accounts.view'), h(() => { const since = U.addDays(U.today(), -30); return { coupons: db.col('coupons').all().map((c) => { const red = db.col('coupon_redemptions').filter((x) => x.code === c.code); return { ...c, uses_total: red.length, uses_30d: red.filter((x) => x.at >= since).length, given_30d: U.round2(U.sum(red.filter((x) => x.at >= since), (x) => x.amount)) }; }) }; }));
r.get('/coupons/available', can('bookings.create'), h(() => db.col('coupons').filter((c) => c.is_active && (!c.valid_until || c.valid_until >= U.today()))));
r.post('/coupons', can('offers.manage_coupons'), h((req) => { const b = req.body; const code = String(b.code || '').toUpperCase().trim(); if (!/^[A-Z0-9]{3,20}$/.test(code)) throw D.httpErr(400, 'Code must be 3-20 letters/digits'); if (db.col('coupons').find((c) => c.code === code)) throw D.httpErr(409, 'Code exists'); return db.col('coupons').insert({ code, description: b.description || '', discount_type: b.discount_type || 'flat', discount_value: Number(b.discount_value) || 0, max_discount_amount: b.max_discount_amount ? Number(b.max_discount_amount) : null, min_fare: b.min_fare ? Number(b.min_fare) : null, total_limit: b.total_limit || null, per_user_limit: b.per_user_limit || null, valid_from: b.valid_from || null, valid_until: b.valid_until || null, audience: b.audience || 'all', channels: b.channels || [], stackable: !!b.stackable, is_active: b.is_active !== false, private: !!b.private }); }));
r.put('/coupons/:id', can('offers.manage_coupons'), h((req) => { const { code, ...rest } = req.body; return db.col('coupons').update(req.params.id, rest); }));

module.exports = r;
