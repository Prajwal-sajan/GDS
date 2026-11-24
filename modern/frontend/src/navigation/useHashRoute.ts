import { useEffect, useState } from "react";

/** Hash routing with the legacy URL scheme (#/gds/schedules, #/fleet/vehicles, …) so bookmarks keep working. */
export function parseHash(hash: string) {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  return { seg: path.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(query) };
}
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parseHash(hash);
}
export const navigate = (href: string) => { window.location.hash = href.replace(/^#/, ""); };
