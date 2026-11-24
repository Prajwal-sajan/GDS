import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

// React port of the legacy feedback primitives (public/js/core.js G.toast / G.modal / G.confirm) with the same DOM and
// class names (#toasts .toast, .ov > .md > .hd/.bd/.ft), so the vendored legacy CSS styles them identically.
type Toast = { id: number; msg: string; kind: string };
type Ask = { msg: string; ok: string; danger: boolean; resolve: (v: boolean) => void };
let toasts: Toast[] = [];
let ask: Ask | undefined;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function toast(msg: string, kind: "" | "ok" | "bad" | "warn" = "") {
  const t = { id: ++seq, msg, kind };
  toasts = [...toasts, t]; emit();
  setTimeout(() => { toasts = toasts.filter((x) => x !== t); emit(); }, 3500);
}
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : String(e), "bad");
export function confirmDialog(msg: string, { ok = "Confirm", danger = false }: { ok?: string; danger?: boolean } = {}) {
  return new Promise<boolean>((resolve) => { ask?.resolve(false); ask = { msg, ok, danger, resolve }; emit(); });
}

export function Modal({ title, size = "", onClose, foot, children }: { title: ReactNode; size?: string; onClose: () => void; foot?: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`md ${size}`} role="dialog" aria-modal="true" tabIndex={-1} ref={box}>
        <div className="hd"><h2>{title}</h2><button className="btn ghost sm" data-x type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="bd">{children}</div>
        {foot && <div className="ft">{foot}</div>}
      </div>
    </div>
  );
}

/** Mount once at the app root: renders the legacy #modal-root (confirm dialogs) and #toasts containers. */
export function FeedbackHost() {
  const snap = useSyncExternalStore(subscribe, () => `${toasts.map((t) => t.id).join(",")}|${ask ? 1 : 0}`);
  const [, force] = useState(0);
  useEffect(() => { force((n) => n + 1); }, [snap]);
  const answer = (v: boolean) => { const a = ask; ask = undefined; emit(); a?.resolve(v); };
  return (
    <>
      <div id="modal-root">
        {ask && (
          <Modal title="Please confirm" onClose={() => answer(false)}
            foot={<><button className="btn" data-n type="button" onClick={() => answer(false)}>Cancel</button><button className={`btn ${ask.danger ? "d" : "p"}`} data-y type="button" onClick={() => answer(true)}>{ask.ok}</button></>}>
            <p>{ask.msg}</p>
          </Modal>
        )}
      </div>
      <div id="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`} role="status">{t.msg}</div>)}</div>
    </>
  );
}
