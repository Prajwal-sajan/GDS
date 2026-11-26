/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, type RefObject } from "react";
import { can, G, permissions } from "../settings/legacy";
import { schedulePnl } from "./vendor/schedulePnl.legacy";

// Schedule overlay → P&L tab. Mounts the verbatim legacy SchedulePnlV18 module (render/decorate/click/change/input) like
// legacy schedules-screenshot-v6.js pnlTab()/pnlContext(), against GET /schedules/{id}/pnl and PUT /schedules/{id}/pnl-expenses.
export function PnlTab({ sid, overlay }: { sid: number; overlay: RefObject<HTMLElement | null> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mod = schedulePnl();
    let p: any = null, alive = true;
    const el = host.current!, ov = overlay.current!;
    const canEdit = () => can("schedules.financial");
    const detail = () => ({ service_number: p.service, service_name: p.service_name, vehicle: p.vehicle ? { registration_number: p.vehicle } : null, coach: p.coach, crew: p.crew, status: p.status });
    const draw = async () => {
      if (!alive) return;
      if (!canEdit()) { el.innerHTML = '<div class="sx-empty">Financial reporting permission required</div>'; return; }
      if (!p) p = await G.get(`/schedules/${sid}/pnl`);
      if (!alive) return;
      const body = ov.querySelector<HTMLElement>("[data-sx-modal-body]"), top = body?.scrollTop ?? 0;
      el.innerHTML = mod.render({ p, detail: detail(), canEdit: canEdit() });
      mod.decorate(ov, canEdit());
      if (body) body.scrollTop = top;
    };
    const ctx = { api: G, overlay: ov, sid, get canEdit() { return canEdit(); }, setPnl: (x: unknown) => { p = x; }, redraw: draw };
    const fail = (e: unknown) => G.err(e);
    const onClick = (e: Event) => { const b = (e.target as Element).closest("button"); if (b && ov.contains(b) && !b.closest("[data-sx-modal-tabs]")) mod.click(b as HTMLElement, ctx).catch(fail); };
    const onChange = (e: Event) => { mod.change(e.target as HTMLElement, ctx).catch(fail); };
    const onInput = (e: Event) => { mod.input(e.target as HTMLElement, ctx); };
    ov.addEventListener("click", onClick); ov.addEventListener("change", onChange); ov.addEventListener("input", onInput);
    mod.reset();
    permissions().then(draw).catch((e) => { el.innerHTML = `<div class="sx-empty">${String((e as Error)?.message ?? e)}</div>`; fail(e); });
    return () => { alive = false; mod.reset(); ov.removeEventListener("click", onClick); ov.removeEventListener("change", onChange); ov.removeEventListener("input", onInput); };
  }, [sid, overlay]);
  return <div ref={host}><div className="sx-loading">Loading P&amp;L…</div></div>;
}

/** legacy: leaving the P&L tab / closing asks before discarding unsaved expense edits. */
export const pnlConfirmLeave = () => schedulePnl().confirmLeave({ api: G });
