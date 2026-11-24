/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { api } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// Shared runtime for the Settings screens. Legacy settings layers render HTML strings straight into the page element
// (`el` = main[data-content]) and set its className (e.g. "lv34-container"); the ported builders do the same so the DOM
// and the vendored legacy CSS match. React renders nothing inside main for these routes.
export const esc = (x: unknown) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** legacy G.get/G.put/G.post/G.del against the same paths (served by /api/admin). */
export const G = {
  get: <T = any>(p: string) => api.admin<T>(p),
  put: <T = any>(p: string, b?: unknown) => api.admin<T>(p, "PUT", b ?? {}),
  post: <T = any>(p: string, b?: unknown) => api.admin<T>(p, "POST", b ?? {}),
  del: <T = any>(p: string, b?: unknown) => api.admin<T>(p, "DELETE", b),
  toast: (m: string, kind?: string) => toast(m, (kind as any) || "ok"),
  err: (e: unknown) => toastError(e),
  confirm: (m: string, o?: { ok?: string; danger?: boolean }) => confirmDialog(m, o),
};

let perms: Promise<string[]> | null = null;
let permsNow: string[] | null = null;
/** legacy req.user.permissions; cached for the session (cleared on sign-out via resetPermissions). */
export function permissions() {
  return (perms ??= api.admin<{ permissions: string[] }>("/auth/permissions").then((r) => (permsNow = r.permissions)).catch(() => (permsNow = [])));
}
export const can = (p: string) => !permsNow || permsNow.includes(p);
export function resetPermissions() { perms = null; permsNow = null; }

/** Mounts a legacy screen like the legacy router (main.js route()): a fresh box div inside main[data-content]. */
export function useLegacyPage(mount: (el: HTMLElement, alive: () => boolean) => void | (() => void) | Promise<void>, deps: unknown[]) {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main[data-content]");
    if (!main) return;
    const el = document.createElement("div");
    el.innerHTML = '<div class="empty">Loading…</div>';
    main.appendChild(el);
    let on = true, cleanup: void | (() => void);
    void permissions().then(async () => {
      if (!on) return;
      const r = mount(el, () => on);
      if (typeof r === "function") cleanup = r; else await r;
    });
    return () => { on = false; if (typeof cleanup === "function") cleanup(); el.remove(); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
