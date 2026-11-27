import { useEffect, useState } from "react";
import { api } from "../api";

// Session permission set (GET /auth/permissions), cached until sign-out. `can` is optimistic before the first load so
// screens never flash "permission required"; components that gate rendering use `usePermissions()` to re-render once loaded.
let pending: Promise<string[]> | null = null;
let loaded: string[] | null = null;
const listeners = new Set<() => void>();

export function permissions(): Promise<string[]> {
  return (pending ??= api.admin<{ permissions: string[] }>("/auth/permissions")
    .then((r) => r.permissions).catch(() => [] as string[])
    .then((p) => { loaded = p; listeners.forEach((f) => f()); return p; }));
}
export const can = (p: string) => !loaded || loaded.includes(p);
export function resetPermissions() { pending = null; loaded = null; }

/** Returns true once permissions are loaded; re-renders the caller when they arrive. */
export function usePermissions(): boolean {
  const [ready, setReady] = useState(loaded !== null);
  useEffect(() => {
    const f = () => setReady(true);
    listeners.add(f); void permissions();
    if (loaded) f();
    return () => { listeners.delete(f); };
  }, []);
  return ready;
}
