import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Port of legacy G.niceSelect (public/js/ui-common.js): native <select class="ui-dd-native"> kept for value/semantics,
// followed by <button class="ui-dd-btn"> and a body-level <div class="ui-dd-menu" role="listbox">. Same DOM → same CSS.
export function NiceSelect({ name, value, options, onChange, disabled, title, required, ...data }: {
  name?: string; value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean; title?: string; required?: boolean;
  [k: `data-${string}`]: string | boolean | undefined;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; min: number }>();
  const idx = Math.max(0, options.findIndex(([v]) => v === value));
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(undefined);
    const outside = (e: MouseEvent) => { if (!(e.target as Element).closest(".ui-dd-menu") && !btn.current?.contains(e.target as Node)) close(); };
    const t = setTimeout(() => { document.addEventListener("click", outside, true); addEventListener("scroll", close, true); }, 0);
    return () => { clearTimeout(t); document.removeEventListener("click", outside, true); removeEventListener("scroll", close, true); };
  }, [pos]);
  const toggle = () => {
    if (disabled) return;
    if (pos) return setPos(undefined);
    const r = (btn.current!.closest(".vp-select,.sp-filter,.ac10-select,.ui-dd-host") ?? btn.current!).getBoundingClientRect();
    setPos({ min: r.width, left: Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 180) - 8)), top: r.bottom + 6 });
  };
  return (
    <>
      <select {...data} name={name} className="ui-dd-native" value={value} disabled={disabled} title={title} required={required} tabIndex={-1} aria-hidden="true"
        onChange={(e) => onChange(e.target.value)} onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      <button ref={btn} type="button" className="ui-dd-btn" aria-haspopup="listbox" aria-label={title ?? "Choose"} disabled={disabled} onClick={(e) => { e.stopPropagation(); toggle(); }}>
        <span>{options[idx]?.[1] ?? ""}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {pos && createPortal(
        <div className="ui-dd-menu" role="listbox" style={{ minWidth: pos.min, left: pos.left, top: pos.top }}>
          {options.map(([v, t], i) => <button key={v} type="button" role="option" data-i={i} className={i === idx ? "sel" : ""} onClick={(e) => { e.stopPropagation(); setPos(undefined); onChange(v); }}>{t}</button>)}
        </div>, document.body)}
    </>
  );
}
