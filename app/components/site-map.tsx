'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG markers require SVG elements with keyboard-accessible button roles. */
import { useRef, useState } from 'react';
import { ArrowUpRight, Box, LocateFixed, Minus, Plus, X } from 'lucide-react';
import { sites, miles, type SiteId } from '../data/sites';
const W = 1000,
  H = 620;
function world(lat: number, lng: number, z: number) {
  const n = 256 * 2 ** z;
  return [
    ((lng + 180) / 360) * n,
    ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  ];
}
export function SiteMap({
  onSelect,
  onClose,
}: {
  onSelect: (id: SiteId) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(12),
    [center, setCenter] = useState({ lat: 34.057, lng: -118.208 }),
    [selected, setSelected] = useState<SiteId>('olympic'),
    [pan, setPan] = useState([0, 0]);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const drag = useRef<{ x: number; y: number; pan: number[] } | null>(null),
    svg = useRef<SVGSVGElement>(null);
  const c = world(center.lat, center.lng, zoom),
    origin = [c[0] - W / 2 - pan[0], c[1] - H / 2 - pan[1]];
  const points = sites.map((s) => {
    const p = world(s.lat, s.lng, zoom);
    return { ...s, x: p[0] - origin[0], y: p[1] - origin[1] };
  });
  const tiles = [];
  for (
    let x = Math.floor(origin[0] / 256);
    x <= Math.floor((origin[0] + W) / 256);
    x++
  )
    for (
      let y = Math.floor(origin[1] / 256);
      y <= Math.floor((origin[1] + H) / 256);
      y++
    )
      tiles.push({ x, y });
  const chosen = sites.find((s) => s.id === selected)!;
  const reset = () => {
    setZoom(12);
    setCenter({ lat: 34.057, lng: -118.208 });
    setPan([0, 0]);
  };
  return (
    <section className="network-panel" aria-label="Seen Health site map">
      <div className="network-intro">
        <div>
          <span className="overline">ONE NETWORK · THREE LOCATIONS</span>
          <h1>Closer to the communities we serve.</h1>
          <p>
            Explore each center and see how the sites connect across Los
            Angeles.
          </p>
        </div>
        <button
          className="network-close"
          onClick={onClose}
          aria-label="Close site map"
        >
          <X size={22} />
        </button>
      </div>
      <div className="network-layout">
        <div className="network-map">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            aria-label="Geographic map of the three Seen Health sites"
            onPointerDown={(e) => {
              if ((e.target as SVGElement).closest('[role=button]')) return;
              svg.current?.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, pan };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const k = W / (svg.current?.getBoundingClientRect().width || W);
              setPan([
                drag.current.pan[0] + (e.clientX - drag.current.x) * k,
                drag.current.pan[1] + (e.clientY - drag.current.y) * k,
              ]);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <rect width={W} height={H} fill="#e8eee6" />
            {tiles.map((t) => (
              <image
                key={`${zoom}-${t.x}-${t.y}`}
                onError={() => setTilesUnavailable(true)}
                href={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
                x={t.x * 256 - origin[0]}
                y={t.y * 256 - origin[1]}
                width="256"
                height="256"
                opacity=".79"
              />
            ))}
            <path
              d={`M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}L${points[2].x},${points[2].y}L${points[0].x},${points[0].y}`}
              fill="none"
              stroke="#478575"
              strokeWidth="2"
              strokeDasharray="7 6"
              opacity=".7"
            />
            {points.map((s, i) => (
              <g
                key={s.id}
                transform={`translate(${s.x},${s.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Select ${s.name}`}
                onClick={() => setSelected(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(s.id);
                  }
                }}
                className="map-pin"
              >
                <circle
                  r={selected === s.id ? 25 : 20}
                  fill={s.color}
                  opacity=".15"
                />
                <circle r="13" fill={s.color} stroke="#fff" strokeWidth="3" />
                <text
                  y="5"
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="12"
                  fontWeight="700"
                >
                  {i + 1}
                </text>
                <rect
                  x="-79"
                  y={s.id === 'alveare' ? 24 : -52}
                  width="158"
                  height="30"
                  rx="8"
                  fill="#fff"
                  stroke="#d4ded5"
                />
                <text
                  x="0"
                  y={s.id === 'alveare' ? 44 : -32}
                  textAnchor="middle"
                  fill="#284638"
                  fontSize="13"
                  fontWeight="600"
                >
                  {s.name}
                </text>
              </g>
            ))}
          </svg>
          <div className="map-tools">
            <button
              onClick={() => {
                setZoom((z) => Math.min(17, z + 1));
                setPan([0, 0]);
              }}
              aria-label="Zoom map in"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => {
                setZoom((z) => Math.max(10, z - 1));
                setPan([0, 0]);
              }}
              aria-label="Zoom map out"
            >
              <Minus size={18} />
            </button>
            <button onClick={reset} aria-label="Fit all sites">
              <LocateFixed size={18} />
            </button>
          </div>
          <div className="map-caption">
            {tilesUnavailable
              ? 'Some map tiles are unavailable. Site locations remain geocoded.'
              : 'Drag to pan · select a marker'}
            <br />
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>{' '}
            · Address geocodes: Esri
          </div>
        </div>
        <aside className="network-sites">
          {sites.map((s, i) => (
            <button
              key={s.id}
              className={`network-site ${selected === s.id ? 'selected' : ''}`}
              onClick={() => setSelected(s.id)}
            >
              <span className="site-number" style={{ background: s.color }}>
                {i + 1}
              </span>
              <span>
                <strong>{s.name}</strong>
                <small>{s.locality}</small>
                <p>{s.summary}</p>
              </span>
            </button>
          ))}
          <article className="network-detail">
            <span className="overline">{chosen.name}</span>
            <p>{chosen.address}</p>
            <p>{chosen.detail}</p>
            <button className="open-model" onClick={() => onSelect(selected)}>
              <Box size={17} />
              Explore this model
              <ArrowUpRight size={17} />
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chosen.address)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open address in Maps <ArrowUpRight size={13} />
            </a>
          </article>
        </aside>
      </div>
      <div className="network-distances">
        {[
          [0, 1],
          [0, 2],
          [1, 2],
        ].map(([a, b]) => (
          <div key={`${a}-${b}`}>
            <span>
              {sites[a].name} ↔ {sites[b].name}
            </span>
            <strong>{miles(sites[a], sites[b]).toFixed(1)} mi</strong>
          </div>
        ))}
        <p>
          Straight-line distances between address points. Dashed connections are
          geographic relationships, not driving routes.
        </p>
      </div>
    </section>
  );
}
