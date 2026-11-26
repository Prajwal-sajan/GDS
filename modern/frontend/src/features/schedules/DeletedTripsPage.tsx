import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

type Row = { id: number; routeId: number; serviceNumber: string; travelDate: string; deletedAt: string | null; deletedBy: string | null };
const fdate = (d: string) => new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** Port of legacy gds.js deletedTrips(): G.tabs + G.table markup, "No deleted trips" empty state, per-row Restore. */
export function DeletedTripsPage({ canRestore }: { canRestore: boolean }) {
  const [rows, setRows] = useState<Row[]>();
  const load = useCallback(async () => { try { setRows((await api.deletedTrips()).deleted); } catch (e) { toastError(e); setRows([]); } }, []);
  useEffect(() => { void load(); }, [load]);
  const restore = async (r: Row) => {
    if (!(await confirmDialog(`Restore ${r.serviceNumber} on ${fdate(r.travelDate)}? It goes back on sale.`, { ok: "Restore" }))) return;
    try { await api.restoreTrip(r.id); toast("Trip restored", "ok"); await load(); } catch (e) { toastError(e); }
  };
  return (
    <>
      <div className="tabs"><a href="#/gds/schedules">Schedules</a><a className="on" href="#/gds/deleted">Deleted trips</a></div>
      <div data-body>
        {!rows ? <div className="empty">Loading…</div> : !rows.length ? <div className="empty">No deleted trips</div> : (
          <div className="tw"><table className="t"><thead><tr><th>Date</th><th>Service</th><th>Deleted by</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{fdate(r.travelDate)}</td><td>{r.serviceNumber}</td><td>{r.deletedBy ?? ""}</td>
                <td>{canRestore && <button type="button" className="btn sm" onClick={() => void restore(r)}>Restore</button>}</td></tr>
            ))}</tbody></table></div>
        )}
      </div>
    </>
  );
}
