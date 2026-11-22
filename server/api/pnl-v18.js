'use strict';
// Snapshot-accurate Schedule P&L: versioned expense edits and audit. Commission is computed from bookings.
const express = require('express');
const db = require('../db');
const D = require('../domain');
const Rp = require('../reports');
const {can} = require('../auth');
const router = express.Router();
const handle = fn => (req,res) => { try { res.json(fn(req)); } catch (err) { res.status(err.status || 500).json({ success:false, message:err.message }); } };
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const maxAmount = 100000000;
const sources = new Set(['', 'Cash', 'Bank', 'Office', 'Driver', 'Helper', 'Agent', 'Other']);
function asAmount(value) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean' ||
      !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > maxAmount)
    throw D.httpErr(400, 'Expense amounts must be from ₹0 to ₹10 crore');
  return Math.round(Number(value) * 100) / 100;
}
router.put('/schedules/:id/pnl-expenses', can('schedules.financial'), handle(req => {
  const schedule = db.col('schedules').get(req.params.id);
  if (!schedule) throw D.httpErr(404, 'Schedule not found');
  if (schedule.status !== 'active') throw D.httpErr(409, 'Expenses cannot be changed on a disabled schedule');
  const input = req.body || {};
  const version = schedule.pnl_expense_version || 0;
  if (!Number.isSafeInteger(input.expected_version) || input.expected_version !== version)
    throw D.httpErr(409, 'P&L changed since you opened it. Refresh before saving.');
  if (!object(input.overrides) || !object(input.sources) || !Array.isArray(input.manual) || input.manual.length > 100)
    throw D.httpErr(400, 'Invalid P&L expense payload');

  // Validate the entire payload before making any mutations. No unrecognized route keys.
  const existingPnl = Rp.tripPnl(schedule);
  const allowed = new Set(existingPnl.expense_breakdown.items.filter(x => !x.manual).map(x => x.edit_key));
  const overrides = {}, funding = {};
  for (const [key, value] of Object.entries(input.overrides)) {
    if (!allowed.has(key)) throw D.httpErr(400, 'Unknown route expense: ' + key);
    overrides[key] = asAmount(value);
  }
  for (const [key, value] of Object.entries(input.sources)) {
    if (!allowed.has(key) || !sources.has(value)) throw D.httpErr(400, 'Invalid expense source');
    if (value) funding[key] = value;
  }
  const oldManual = db.col('trip_expenses').filter(x => x.schedule_id == schedule.id);
  const oldById = new Map(oldManual.map(x => [Number(x.id), x]));
  const seen = new Set();
  const manual = input.manual.map(x => {
    if (!object(x) || typeof x.label !== 'string' || !x.label.trim() || x.label.trim().length > 80)
      throw D.httpErr(400, 'Expense description must be 1–80 characters');
    if (!['fixed', 'running'].includes(x.type) || !sources.has(x.source || ''))
      throw D.httpErr(400, 'Invalid expense category/source');
    const id = x.id === null || x.id === undefined ? null : Number(x.id);
    if (id !== null && (!Number.isSafeInteger(id) || !oldById.has(id) || seen.has(id)))
      throw D.httpErr(400, 'Unknown or duplicate manual expense');
    if (id !== null) seen.add(id);
    return { id, label:x.label.trim(), amount:asAmount(x.amount), type:x.type, source:x.source || '' };
  });

  // Replace only this schedule's manual expense rows; never touch other schedules.
  for (const old of oldManual) if (!seen.has(Number(old.id))) db.col('trip_expenses').remove(old.id);
  for (const row of manual) {
    const data = { label:row.label, amount:row.amount, key:'manual', type:row.type, source:row.source, by:req.user.name };
    if (row.id === null) db.col('trip_expenses').insert({ schedule_id:schedule.id, ...data });
    else db.col('trip_expenses').update(row.id, data);
  }
  schedule.expense_overrides = overrides;
  schedule.pnl_expense_sources = funding;
  schedule.pnl_expense_version = version + 1;
  db.persist();
  const next = Rp.tripPnl(schedule);
  D.audit('schedule', schedule.id, 'pnl_expenses', {
    before:{version,expense:existingPnl.expense,profit:existingPnl.profit},
    after:{version:next.expense_version,expense:next.expense,profit:next.profit},
    overrides, sources:funding, manual_count:manual.length
  }, req.user);
  return next;
}));
module.exports = router;
