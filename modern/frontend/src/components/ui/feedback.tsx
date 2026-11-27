import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// React port of the legacy feedback primitives (public/js/core.js G.toast / G.modal / G.confirm) with the same DOM and
// class names (#toasts .toast, .ov > .md > .hd/.bd/.ft), so the vendored legacy CSS styles them identically.
type Toast = { id: number; msg: string; kind: string };
type Ask = { msg: string; ok: string; danger: boolean; resolve: (v: boolean) => void };
/** Legacy G.field descriptor. */
export type PromptField = { name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "email" | "tel";
  value?: string | number | boolean | null; options?: ([string, string] | string)[]; required?: boolean; full?: boolean; placeholder?: string; rows?: number; step?: string };
export type PromptValues = Record<string, string | number | boolean | null>;
type Prompt = { title: string; fields: PromptField[]; ok: string; size?: string; resolve: (v: PromptValues | null) => void };
type Info = { title: string; size?: string; body: ReactNode; resolve: () => void };
let prompt: Prompt | undefined;
let info: Info | undefined;
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
/** Legacy G.prompt: grid g2 form of G.field inputs; resolves with values or null when cancelled. */
export function promptDialog(title: string, fields: PromptField[], { ok = "Save", size }: { ok?: string; size?: string } = {}) {
  return new Promise<PromptValues | null>((resolve) => { prompt?.resolve(null); prompt = { title, fields, ok, size, resolve }; emit(); });
}
/** Legacy G.modal with body only (read-only information dialogs). */
export function infoDialog(title: string, body: ReactNode, size = "") {
  return new Promise<void>((resolve) => { info?.resolve(); info = { title, body, size, resolve }; emit(); });
}

function PromptForm({ p, done }: { p: Prompt; done: (v: PromptValues | null) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => {
    const v: PromptValues = {};
    form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea").forEach((el) => {
      if (!el.name) return;
      if (el instanceof HTMLInputElement && el.type === "checkbox") v[el.name] = el.checked;
      else if (el instanceof HTMLInputElement && el.type === "number") v[el.name] = el.value === "" ? null : Number(el.value);
      else v[el.name] = el.value;
    });
    for (const f of p.fields) if (f.required && (v[f.name] === "" || v[f.name] == null)) return toast(`${f.label} is required`, "bad");
    done(v);
  };
  return (
    <Modal title={p.title} size={p.size} onClose={() => done(null)}
      foot={<><button className="btn" data-n type="button" onClick={() => done(null)}>Cancel</button><button className="btn p" data-y type="button" onClick={submit}>{p.ok}</button></>}>
      <form className="grid g2" data-f ref={form} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {p.fields.map((f) => {
          const span = f.full ? { gridColumn: "1/-1" } : undefined, v = f.value ?? "";
          if (f.type === "select") return <label key={f.name} className="f" style={span}>{f.label}<select name={f.name} defaultValue={String(v)}>{(f.options ?? []).map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return <option key={val} value={val}>{lab}</option>; })}</select></label>;
          if (f.type === "textarea") return <label key={f.name} className="f" style={span}>{f.label}<textarea name={f.name} rows={f.rows ?? 3} defaultValue={String(v)} /></label>;
          if (f.type === "checkbox") return <label key={f.name} className="chk" style={span}><input type="checkbox" name={f.name} defaultChecked={!!v} /> {f.label}</label>;
          return <label key={f.name} className="f" style={span}>{f.label}<input name={f.name} type={f.type ?? "text"} defaultValue={String(v)} placeholder={f.placeholder} step={f.step} /></label>;
        })}
      </form>
    </Modal>
  );
}

export function Modal({ title, size = "", className = "", portal = false, onClose, foot, children }: { title: ReactNode; size?: string; className?: string; portal?: boolean; onClose: () => void; foot?: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      const all = document.querySelectorAll(".ov"); // only the topmost dialog closes on Escape
      if (e.key === "Escape" && all[all.length - 1]?.contains(box.current)) close.current();
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, []);
  const dialog = (
    <div className={`ov${className ? ` ${className}` : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`md ${size}`} role="dialog" aria-modal="true" tabIndex={-1} ref={box}>
        <div className="hd"><h2>{title}</h2><button className="btn ghost sm" data-x type="button" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="bd">{children}</div>
        {foot && <div className="ft">{foot}</div>}
      </div>
    </div>
  );
  // portal: mount in #modal-root at body level like legacy G.modal, so page typography doesn't leak into the dialog.
  const host = portal ? document.getElementById("modal-root") : null;
  return host ? createPortal(dialog, host) : dialog;
}

/** Mount once at the app root: renders the legacy #modal-root (confirm dialogs) and #toasts containers. */
export function FeedbackHost() {
  const snap = useSyncExternalStore(subscribe, () => `${toasts.map((t) => t.id).join(",")}|${ask ? 1 : 0}|${prompt ? prompt.title : ""}|${info ? info.title : ""}`);
  const [, force] = useState(0);
  useEffect(() => { force((n) => n + 1); }, [snap]);
  const answer = (v: boolean) => { const a = ask; ask = undefined; emit(); a?.resolve(v); };
  const promptDone = (v: PromptValues | null) => { const p = prompt; prompt = undefined; emit(); p?.resolve(v); };
  const infoDone = () => { const i = info; info = undefined; emit(); i?.resolve(); };
  return (
    <>
      <div id="modal-root">
        {info && <Modal key={`i${info.title}`} title={info.title} size={info.size} onClose={infoDone}>{info.body}</Modal>}
        {prompt && <PromptForm key={`p${prompt.title}`} p={prompt} done={promptDone} />}
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
