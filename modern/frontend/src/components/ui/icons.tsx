// Exact SVG geometry from the legacy GDS (public/js/main.js `P` and public/js/settings-parity.js `icon()`).
// Kept as data so the React markup renders byte-identical paths to the legacy header.

/** Header / GDS pill icons — legacy main.js `svg(k)` (stroke-width 2, single path). */
export const NAV_PATHS = {
  trips: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  gds: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  chats: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  calls: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  schedules: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  routes: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  crm: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  vehicles: "M3 6h18v12H3zM3 14h18M7 18v1.5M17 18v1.5",
  accounts: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  staff: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  dailyops: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  sarathi: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  bus: "M3 6h18v12H3zM3 14h18",
} as const;
export type NavIcon = keyof typeof NAV_PATHS;

export function NavSvg({ name }: { name: NavIcon }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={NAV_PATHS[name]} />
    </svg>
  );
}

/** Settings-surface icons — legacy settings-parity.js `icon(name)` (stroke-width 1.9, multi-element). */
const UI: Record<string, JSX.Element> = {
  chevronDown: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 13l4 4L19 7" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" /></>,
  settings: <><path d="M12 8.4A3.6 3.6 0 1112 15.6 3.6 3.6 0 0112 8.4z" /><path d="M4.6 12a7.7 7.7 0 01.1-1.2l-2-1.6 2-3.5 2.4.8a8.5 8.5 0 012-1.2l.4-2.5h4l.4 2.5a8.5 8.5 0 012 1.2l2.4-.8 2 3.5-2 1.6c.1.4.1.8.1 1.2s0 .8-.1 1.2l2 1.6-2 3.5-2.4-.8a8.5 8.5 0 01-2 1.2l-.4 2.5h-4l-.4-2.5a8.5 8.5 0 01-2-1.2l-2.4.8-2-3.5 2-1.6c-.1-.4-.1-.8-.1-1.2z" /></>,
  users: <><path d="M16 19a4 4 0 00-8 0" /><circle cx="12" cy="8" r="4" /><path d="M20 19a4 4 0 00-3-3.87M4 19a4 4 0 013-3.87" /></>,
  brush: <><path d="M13 4l7 7-5 5-7-7z" /><path d="M6 18c-2 0-3 1-3 3 2 0 4-1 4-3 0-1-1-2-1-2s-1 1-1 2z" /></>,
  sliders: <path d="M4 6h6M14 6h6M10 6v6M4 18h10M18 18h2M14 18v-6M4 12h2M10 12h10M6 12V6" />,
  chat: <path d="M8 17l-4 3V7a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3H8z" />,
  spark: <><path d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2z" /><path d="M5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14zm14 1l.5 1.7 1.7.5-1.7.5-.5 1.8-.5-1.8-1.7-.5 1.7-.5.5-1.7z" /></>,
  switchUser: <><path d="M16 17l4-4-4-4" /><path d="M20 13H9" /><path d="M8 7A4 4 0 118 15M4 19a4 4 0 014-4" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></>,
  phoneDevice: <><rect x="8" y="3" width="8" height="18" rx="2" /><circle cx="12" cy="17" r="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v5" /><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none" /></>,
  key: <path d="M15 7a4 4 0 11-3.9 5H4l-2 2 2 2 2-2h2l2-2h1.1A4 4 0 0115 7z" />,
};
export function UiIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{UI[name] ?? UI.info}</svg>;
}
