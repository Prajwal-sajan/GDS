import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Me } from "../api";
import { NavSvg, UiIcon } from "../components/ui/icons";
import { toast } from "../components/ui/feedback";
import { LANGUAGES, SETTINGS_MENU, SUB, TOP, sectionOf, settingsHref, type Role } from "../navigation/nav";

/**
 * React port of the legacy shell (public/js/main.js `shell()` + settings-complete.js header menus):
 * same DOM structure and class names so the vendored legacy CSS renders it identically.
 * Deviation (documented in UI_MIGRATION_GAPS.md): Integrations is an added settings entry for the RedBus provider screens.
 */
export function AppShell({ me, seg, onSignOut, children }: { me: Me; seg: string[]; onSignOut: () => void; children: ReactNode }) {
  const role = me.role as Role;
  const [top, sub] = sectionOf(seg);
  const [open, setOpen] = useState<"lang" | "settings" | null>(null);
  const [lang, setLang] = useState(() => localStorage.getItem("stp_language") || "English");
  const hdr = useRef<HTMLElement>(null);
  const settingsSection = seg[0] === "settings" ? seg[1] || "team-access" : "";

  // Legacy keeps --hdr-h in sync with the header height (sticky offsets depend on it).
  useLayoutEffect(() => {
    const el = hdr.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty("--hdr-h", `${el.offsetHeight}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest(".stp-head-controls")) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("click", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);
  useEffect(() => { setOpen(null); }, [seg.join("/")]);
  useEffect(() => {
    const label = [...TOP, ...SUB].find((x) => x.key === (sub || top))?.label ?? "Settings";
    document.title = `${label} · JourneyOS`;
  }, [top, sub]);

  const chooseLang = (v: string) => {
    localStorage.setItem("stp_language", v); setLang(v); setOpen(null);
    if (v !== "English") toast(`${v} selected · other screen translations are not yet available`);
  };

  return (
    <div className="app">
      <header className="iconic-app-header" ref={hdr}>
        <div className="hdr-in">
          <div className="hdr-l">
            <a className="brand" href="#/" title="Home"><span className="iconic-brand-logo"><NavSvg name="bus" /></span></a>
            <nav className="iconic-nav-cluster" aria-label="Main">
              {TOP.filter((t) => t.roles.includes(role)).map((t) => (
                <a key={t.key} className={`iconic-tab-pill${top === t.key ? " iconic-tab-pill--active" : ""}`} data-active={String(top === t.key)} data-top={t.key} href={t.href}
                  aria-current={top === t.key ? "page" : undefined}>
                  <NavSvg name={t.key} /><span>{t.label}</span>
                </a>
              ))}
            </nav>
          </div>
          <div className="hdr-r">
            <div className="stp-head-controls">
              <button className="stp-head-btn" type="button" data-language-btn aria-haspopup="true" aria-expanded={open === "lang"}
                onClick={(e) => { e.stopPropagation(); setOpen(open === "lang" ? null : "lang"); }}>
                <UiIcon name="globe" /><span data-current-language>{lang}</span><UiIcon name="chevronDown" />
              </button>
              <button className="stp-head-btn" type="button" data-settings-btn aria-haspopup="true" aria-expanded={open === "settings"}
                onClick={(e) => { e.stopPropagation(); setOpen(open === "settings" ? null : "settings"); }}>
                <UiIcon name="settings" />Settings<UiIcon name="chevronDown" />
              </button>
              <div className="stp-pop stp-lang-pop" data-lang-pop hidden={open !== "lang"} role="menu" aria-label="Language">
                {LANGUAGES.map((l) => (
                  <button key={l} className={`stp-lang-item${l === lang ? " active" : ""}`} data-language-option={l} type="button" role="menuitemradio" aria-checked={l === lang} onClick={() => chooseLang(l)}>
                    <span>{l}</span><span className="tick"><UiIcon name="check" /></span>
                  </button>
                ))}
              </div>
              <div className="stp-pop stp-settings-pop" data-settings-pop hidden={open !== "settings"} role="menu" aria-label="Settings">
                <div className="stp-settings-pop-head"><b data-testid="whoami" data-role={me.role} title={`${me.name} · ${me.role}`}>{me.phone || "Operator Account"}</b><span>Operator Account</span></div>
                <div className="stp-settings-pop-body">
                  <div className="stp-settings-label">BUSINESS SETTINGS</div>
                  {SETTINGS_MENU.filter((m) => m.roles.includes(role)).map((m) => (
                    <a key={m.key} href={settingsHref(m.key)} className={`stp-settings-link${m.key === settingsSection ? " active" : ""}`} data-settings-link={m.key} role="menuitem">
                      <span className={`stp-settings-link-icon ${m.color}`}><UiIcon name={m.icon} /></span>
                      <span><b>{m.label}</b><small>{m.desc}</small></span>
                    </a>
                  ))}
                  <button type="button" className="stp-settings-link stp-logout" data-settings-logout role="menuitem" onClick={onSignOut}>
                    <span className="stp-settings-link-icon gray"><UiIcon name="lock" /></span>
                    <span><b>Sign out</b><small>End the current session</small></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      {top === "gds" && (
        <div data-sub>
          <div className="page" style={{ paddingBottom: 0 }}>
            <nav className="subnav" aria-label="GDS">
              {SUB.filter((s) => s.roles.includes(role)).map((s) => (
                <a key={s.key} className={`iconic-tab-pill iconic-tab-pill--compact${s.key === sub ? " iconic-tab-pill--active" : ""}`} data-active={String(s.key === sub)} href={s.href}
                  aria-current={s.key === sub ? "page" : undefined}>
                  <span className="iconic-tab-pill__icon"><NavSvg name={s.key} /></span>{s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}
      <main className="page" data-content>{children}</main>
    </div>
  );
}
