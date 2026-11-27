import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "../../components/ui/feedback";

// React port of legacy vehicles-parity-v9.js mapShell()/mountMap(): slippy map from public OpenStreetMap tiles
// (Web Mercator, 256px tiles), drag to pan, wheel/±/reset zoom, 3D perspective toggle, and vehicle pins.
// Only reported coordinates are plotted; nothing is simulated here.
export type MapPin = { id: number; label: string; lat: number; lng: number };

const tileXY = (lat: number, lng: number, z: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * 2 ** z, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z };
};
const unproject = (x: number, y: number, z: number) => ({ lng: (x / 2 ** z) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) });
const mean = (pins: MapPin[]) => ({ lat: pins.reduce((n, p) => n + p.lat, 0) / pins.length, lng: pins.reduce((n, p) => n + p.lng, 0) / pins.length });

const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const BUS = "M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11M5 13h14M5 17h14M7 17v3m10-3v3";

export function TileMap({ pins, single = false, onPin, fitSignal = 0 }: { pins: MapPin[]; single?: boolean; onPin?: (id: number) => void; fitSignal?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(() => ({ zoom: single ? 14 : 6, center: pins.length ? mean(pins) : { lat: 17.38, lng: 78.48 } }));
  const [is3d, setIs3d] = useState(false);
  const drag = useRef<{ x: number; y: number; old: { x: number; y: number } } | null>(null);
  const fitted = useRef(false);

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const fit = () => {
    if (!pins.length) return;
    const w = size.w || 1000, h = size.h || 500; let zoom = 3;
    for (let z = 14; z >= 3; z--) {
      const c = pins.map((p) => tileXY(p.lat, p.lng, z));
      const dx = (Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x))) * 256, dy = (Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y))) * 256;
      if (dx < w - 200 && dy < h - 180) { zoom = z; break; }
    }
    setView({ zoom, center: mean(pins) });
  };
  useEffect(() => { if (size.w && !fitted.current) { fitted.current = true; if (!single) fit(); } }, [size.w]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fitSignal) fit(); }, [fitSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = box.current; if (!el) return;
    const wheel = (e: WheelEvent) => { if ((e.target as Element).closest("button")) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); };
    el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel);
  });
  const zoomBy = (dir: number) => setView((v) => ({ ...v, zoom: Math.max(2, Math.min(18, v.zoom + dir)) }));

  const { zoom, center } = view, { w, h } = size;
  const c = tileXY(center.lat, center.lng, zoom), ox = c.x * 256 - w / 2, oy = c.y * 256 - h / 2;
  const tiles: JSX.Element[] = [];
  if (w && h) {
    const fx = Math.floor(ox / 256), fy = Math.floor(oy / 256), cols = Math.ceil(w / 256) + 2, rows = Math.ceil(h / 256) + 2, world = 2 ** zoom;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = fx + i, y = fy + j; if (y < 0 || y >= world) continue;
      tiles.push(<img key={`${zoom}/${x}/${y}`} draggable={false} alt="" style={{ left: x * 256 - ox, top: y * 256 - oy }} src={`https://tile.openstreetmap.org/${zoom}/${((x % world) + world) % world}/${y}.png`} />);
    }
  }
  return (
    <div ref={box} className={`vp-map${is3d ? " is-3d" : ""}`} data-vp-map={single ? "single" : "fleet"}
      onPointerDown={(e) => { if ((e.target as Element).closest("button,a")) return; drag.current = { x: e.clientX, y: e.clientY, old: tileXY(center.lat, center.lng, zoom) }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setView((v) => ({ ...v, center: unproject(d.old.x - (e.clientX - d.x) / 256, d.old.y - (e.clientY - d.y) / 256, v.zoom) })); }}>
      <div className="vp-map-tiles">{tiles}</div>
      <div className="vp-map-markers">{w > 0 && pins.map((p) => {
        const t = tileXY(p.lat, p.lng, zoom), x = t.x * 256 - ox, y = t.y * 256 - oy;
        if (x < -100 || x > w + 100 || y < -110 || y > h + 100) return null;
        return <button key={p.id} type="button" className="vp-map-pin" title={p.label} style={{ left: x, top: y }} data-map-vehicle={p.id} onClick={() => onPin?.(p.id)}>
          <span className="vp-map-plate">{p.label}</span><span className="vp-red-bus"><svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={BUS} /></svg></span></button>;
      })}</div>
      <div className="vp-map-controls">
        <button type="button" className="vp-icon plain" data-map-action="reset" aria-label="Show all" title="Show all" onClick={fit}><Ico d="M12 2v3m0 14v3M2 12h3m14 0h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /></button>
        <button type="button" className="vp-icon plain" data-map-action="zoom-in" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1)}><Ico d="M12 5v14M5 12h14" /></button>
        <button type="button" className="vp-map-minus" data-map-action="zoom-out" aria-label="Zoom out" onClick={() => zoomBy(-1)}>−</button>
        <button type="button" className="vp-icon plain" data-map-action="layers" aria-label="Map layers" title="Map layers" onClick={() => toast("OpenStreetMap standard layer")}><Ico d="m12 2 10 5-10 5L2 7l10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5" /></button>
        <button type="button" className="vp-icon plain" data-map-action="street-view" aria-label="Street-level view" title="Street-level view" onClick={() => toast("Street imagery requires a connected street-view provider")}><Ico d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /></button>
        <button type="button" className="vp-map-three" data-map-action="3d" aria-pressed={is3d} onClick={() => { setIs3d((x) => { toast(!x ? "Perspective preview enabled" : "2D map enabled"); return !x; }); }}>3D</button>
      </div>
      <small className="vp-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</small>
      {!pins.length && <div className="vp-map-no-pins">No GPS positions reported. Map pins are shown only for reported coordinates.</div>}
    </div>
  );
}
