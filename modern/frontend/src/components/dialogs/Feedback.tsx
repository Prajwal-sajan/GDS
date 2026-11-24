import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Port of legacy core.js G.modal / G.confirm / G.toast — same DOM (.ov > .md > .hd/.bd/.ft, #toasts > .toast). */
export function Modal({ title, size = "", onClose, children, foot }: { title: string; size?: string; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  return createPortal(
    <div className="ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`md ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="hd"><h2>{title}</h2><button className="btn ghost sm" data-x onClick={onClose} aria-label="Close">✕</button></div>
        <div className="bd">{children}</div>
        {foot && <div className="ft">{foot}</div>}
      </div>
    </div>,
    document.body,
  );
}

type Toast = { id: number; msg: string; kind: "" | "ok" | "bad" | "warn" };
type ConfirmReq = { msg: string; ok: string; danger?: boolean; resolve: (v: boolean) => void };
const Ctx = createContext<{ toast: (m: string, k?: Toast["kind"]) => void; confirm: (m: string, o?: { ok?: string; danger?: boolean }) => Promise<boolean> } | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [req, setReq] = useState<ConfirmReq>();
  const toast = useCallback((msg: string, kind: Toast["kind"] = "") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  const confirm = useCallback((msg: string, o: { ok?: string; danger?: boolean } = {}) =>
    new Promise<boolean>((resolve) => setReq({ msg, ok: o.ok ?? "Confirm", danger: o.danger, resolve })), []);
  const done = (v: boolean) => { req?.resolve(v); setReq(undefined); };
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {req && (
        <Modal title="Please confirm" onClose={() => done(false)}
          foot={<><button className="btn" data-n onClick={() => done(false)}>Cancel</button><button className={`btn ${req.danger ? "d" : "p"}`} data-y onClick={() => done(true)}>{req.ok}</button></>}>
          <p>{req.msg}</p>
        </Modal>
      )}
      <div id="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`} role="status">{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}
export function useFeedback() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback outside FeedbackProvider");
  return c;
}
