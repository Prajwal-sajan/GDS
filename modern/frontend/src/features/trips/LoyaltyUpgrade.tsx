import { useCallback, useEffect, useState } from "react";
import { api, type SeatUpgrade, type UpgradeView } from "../../api";
import { confirmDialog, Modal, promptDialog, toast, toastError } from "../../components/ui/feedback";

// React port of legacy public/js/trips-loyalty-v39.js (badge + consent-backed operator workflow).
const P = {
  sparkle: ["m12 2 2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2Z", "m20 15 .8 2.2L23 18l-2.2.8L20 21l-.8-2.2L17 18l2.2-.8L20 15Z"],
  ticket: ["M5 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z", "M8 7v10m8-10v10"],
  check: ["m5 12 4 4L19 6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
};
export function LvIcon({ k, size = 15 }: { k: keyof typeof P; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">{P[k].map((d) => <path key={d} d={d} />)}</svg>;
}

export function UpgradeBadge({ u }: { u: SeatUpgrade | null | undefined }) {
  if (!u || !["offered", "applied", "declined", "expired"].includes(u.status)) return null;
  const status = u.status === "offered" && Date.parse(u.expires_at || "0") <= Date.now() ? "expired" : u.status;
  const title = status === "offered" ? "Pending loyalty upgrade offer — seat not changed" : status === "applied" ? "Loyalty upgrade applied with recorded passenger consent"
    : status === "declined" ? "Passenger declined seat upgrade" : "Seat upgrade offer expired";
  const label = status === "offered" ? "OFFERED" : status === "applied" ? "UPGRADED" : status === "declined" ? "DECLINED" : "EXPIRED";
  return (
    <span className={`lv39-upgrade-badge ${status}`} title={title} aria-label={`${title} from ${u.from_seat} to ${u.to_seat}`}>
      <LvIcon k={status === "applied" ? "check" : status === "offered" ? "sparkle" : "clock"} />{label} {u.from_seat} → {u.to_seat}
    </span>
  );
}

export function UpgradeModal({ sid, pnr, seat, onClose, onDone }: { sid: string | number; pnr: string; seat: string; onClose: () => void; onDone: () => Promise<void> | void }) {
  const [r, setR] = useState<UpgradeView | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const x = await api.upgradeView(sid, pnr, seat); setR(x); setTarget(x.options[0]?.seat || ""); }, [sid, pnr, seat]);
  useEffect(() => { load().catch((e) => { toastError(e); onClose(); }); }, [load, onClose]);
  const run = async (fn: () => Promise<boolean | void>) => {
    if (busy) return; setBusy(true);
    try { if ((await fn()) !== false) { await load(); await onDone(); } } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const a = r?.offer || null;
  const isOffer = !!a && a.status === "offered" && Date.parse(a.expires_at) > Date.now(), isApplied = a?.status === "applied";
  const title = isOffer ? "OFFERED" : isApplied ? "UPGRADED" : a?.status === "declined" ? "Declined" : a?.status === "expired" || a?.status === "offered" ? "Expired" : "New offer";
  const offer = () => run(async () => {
    if (!target) { toast("Select an available upgrade berth", "warn"); return false; }
    if (!await confirmDialog(`Offer a free loyalty upgrade from ${r!.current_seat} to ${target}? The original seat remains unchanged until passenger consent.`, { ok: "Offer upgrade" })) return false;
    await api.upgradeOffer(sid, pnr, seat, target); toast("Loyalty upgrade offered; no seat was changed", "ok");
  });
  const accept = () => run(async () => {
    const v = await promptDialog("Record passenger consent", [
      { name: "method", label: "Consent method", type: "select", options: [["phone", "Passenger phone call"], ["chat", "Passenger chat"], ["in_person", "Passenger in person"], ["authorized_provider", "Authorized provider confirmation"]] },
      { name: "reference", label: "Consent evidence / conversation reference", required: true, full: true },
    ], { ok: "Review upgrade" });
    if (!v) return false;
    if (!await confirmDialog(`Passenger consent confirmed? This will move the booked seat from ${a!.from_seat} to ${a!.to_seat}. This affects live inventory.`, { ok: "Apply seat upgrade" })) return false;
    await api.upgradeAccept(sid, pnr, seat, { consentConfirmed: true, consentMethod: String(v.method), consentReference: String(v.reference) });
    toast("Passenger seat upgrade applied and audited", "ok");
  });
  const decline = () => run(async () => {
    if (!await confirmDialog("Mark this loyalty upgrade offer as declined?", { ok: "Decline offer" })) return false;
    await api.upgradeDecline(sid, pnr, seat, "Declined by passenger (operator recorded)"); toast("Upgrade offer declined", "ok");
  });
  return (
    <Modal title={<><LvIcon k="sparkle" size={21} /> Loyalty Seat Upgrade</>} size="lg" className="lv39-upgrade-modal" onClose={onClose}>
      {!r ? <p>Loading available upgrade seats…</p> : (
        <>
          <div className="lv39-upgrade-details"><div><strong>PNR:</strong> {r.pnr}</div><div><strong>Current seat:</strong> {r.current_seat}</div><div><strong>Passenger:</strong> eligible loyalty tier required; upgrade is free</div></div>
          {a?.status && <div className={`lv39-upgrade-state ${isApplied ? "applied" : ""}`}><LvIcon k={isApplied ? "check" : "sparkle"} size={19} /> <strong>{title}</strong>{"\u00a0"}{a.from_seat || ""} → {a.to_seat || ""}</div>}
          {isOffer ? (
            <><p>Offer expires: <strong>{new Date(a!.expires_at).toLocaleTimeString("en-IN")}</strong>. The original seat is retained until accepted.</p>
              <p className="lv39-upgrade-note">Before applying the new berth, obtain and record passenger consent. An operator assertion is not independent proof of provider delivery.</p></>
          ) : isApplied ? <p className="lv39-upgrade-note">The seat was changed after recorded consent. Previous: {a!.from_seat} · New: {a!.to_seat}.</p>
            : (
              <><p>{r.reason || "Available upgrade choices"}</p>
                {r.options.length ? (
                  <div className="lv39-upgrade-target" role="radiogroup" aria-label="Available free upgraded seats">
                    {r.options.map((o) => <label key={o.seat}><input type="radio" name="lv39-target" value={o.seat} checked={target === o.seat} onChange={() => setTarget(o.seat)} /> <LvIcon k="ticket" /> <span><strong>{o.seat}</strong><small> {o.deck || ""}</small></span></label>)}
                  </div>
                ) : <div className="lv39-upgrade-note">No eligible unsold seat is available at this time.</div>}</>
            )}
          <div className="lv39-upgrade-actions">
            <button type="button" data-lv39-close="" onClick={onClose}>Close</button>
            {isOffer ? <><button type="button" className="danger" data-lv39-decline="" onClick={() => void decline()}>Decline offer</button><button type="button" className="primary" data-lv39-accept="" onClick={() => void accept()}>Record acceptance</button></>
              : !isApplied && r.options.length ? <button type="button" className="primary" data-lv39-offer="" onClick={() => void offer()}><LvIcon k="sparkle" /> Offer selected berth</button> : null}
          </div>
        </>
      )}
    </Modal>
  );
}
