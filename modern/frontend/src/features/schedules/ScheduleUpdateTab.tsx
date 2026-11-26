/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, type RefObject } from "react";
import type { ScheduleRow } from "../../api";
import { G, permissions } from "../settings/legacy";
import { scheduleUpdate } from "./vendor/scheduleUpdate.legacy";

// Schedule overlay → Update tab. Mounts the verbatim legacy ScheduleUpdateV51 module (render/click/change/sync) exactly as
// legacy schedules-screenshot-v6.js updateTab()/handleOverlayClick()/handleOverlayChange() do, against
// GET /schedules/{id}/update-v51, PUT .../assignment and PUT .../sync. S.detail is the legacy schedule shape built from the list row.
export function UpdateTab({ row, overlay }: { row: ScheduleRow; overlay: RefObject<HTMLElement | null> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mod = scheduleUpdate();
    const el = host.current!, ov = overlay.current!;
    let alive = true;
    const S: any = {
      detail: {
        id: row.id, service_number: row.serviceNumber, service_name: row.serviceName, status: row.status, origin: row.origin, destination: row.destination,
        travel_date: row.travelDate, departure_time: row.departureTime, arrival_time: row.arrivalTime, coach: row.coach,
        seats_booked: row.booked, capacity: row.capacity, sync_with_route: true, vehicle: null,
      },
      trip: null,
    };
    const draw = async () => {
      if (!alive) return;
      const body = ov.querySelector<HTMLElement>("[data-sx-modal-body]"), top = body?.scrollTop ?? 0;
      if (!mod.state(S).data) await mod.render(S, G); // primes s.data (GET update-v51) so sync_with_route is known
      if (!alive) return;
      S.detail.sync_with_route = mod.state(S).data?.sync_with_route !== false;
      el.innerHTML = await mod.render(S, G);
      if (body) body.scrollTop = top;
    };
    const reload = async () => { mod.state(S).data = null; await draw(); };
    const ctx = { G, rerender: draw, reload, confirm: G.confirm, toast: G.toast };
    const fail = (e: unknown) => G.err(e);
    const onClick = (e: Event) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-u51-action]");
      if (b && el.contains(b)) mod.click(b, S, ctx).catch(fail);
      else if ((e.target as Element).closest("[data-sx-coach-transfer]") && el.contains(e.target as Node))
        G.toast("Coach transfer requires an authorized seat migration workflow; use the vehicle selector with a matching coach layout.", "warn");
    };
    const onChange = (e: Event) => {
      const x = e.target as HTMLElement;
      if (!el.contains(x)) return;
      if (x.hasAttribute("data-u51-sync")) { mod.sync(x as HTMLInputElement, S, ctx).catch(fail); return; }
      mod.change(x, S);
    };
    const onInput = (e: Event) => { const x = e.target as HTMLElement; if (el.contains(x) && !x.hasAttribute("data-u51-sync")) mod.change(x, S); };
    ov.addEventListener("click", onClick); ov.addEventListener("change", onChange); ov.addEventListener("input", onInput);
    permissions().then(draw).catch((e) => { el.innerHTML = `<div class="sx-empty">${String((e as Error)?.message ?? e)}</div>`; fail(e); });
    return () => { alive = false; ov.removeEventListener("click", onClick); ov.removeEventListener("change", onChange); ov.removeEventListener("input", onInput); };
  }, [row, overlay]);
  return <div ref={host}><div className="sx-loading">Loading schedule update…</div></div>;
}
