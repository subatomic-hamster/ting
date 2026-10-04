import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { DENTISTS, MAP_CENTER, useDentistQuotes } from '../hooks/useDentistQuotes';
import { formatMoney } from '../lib/format';

// OpenStreetMap tiles through Leaflet: no AWS Location Service and no API key. Pins are colored by network.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Leaflet writes colors into SVG attributes, so resolve theme tokens to concrete values (hex fallback for tests/SSR). */
const token = (name: string, fallback: string) =>
  (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()) || fallback;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export function DentistMap() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const quotes = useDentistQuotes();

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([MAP_CENTER.lat, MAP_CENTER.lng], 12);
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    L.circleMarker([MAP_CENTER.lat, MAP_CENTER.lng], { radius: 5, color: token('ink', '#2a1c1e'), fillOpacity: 1 }).bindTooltip(`You (${MAP_CENTER.label})`).addTo(group);
    for (const d of DENTISTS) {
      const q = quotes.get(d.id);
      const color = d.inNetwork ? token('brand-600', '#ad1f2d') : token('warn', '#b45309');
      L.circleMarker([d.lat, d.lng], { radius: 9, color, weight: 2, fillColor: color, fillOpacity: 0.35 })
        .bindPopup(
          `<strong>${esc(d.name)}</strong><br>${d.inNetwork ? 'In network' : 'Out of network'} · ${d.distanceMiles} mi` +
            (q ? `<br>You'd pay <strong>${formatMoney(q.yourCost)}</strong> for your plan` : '') +
            (d.acceptingNew ? '' : '<br><em>Not accepting new patients</em>'),
        )
        .addTo(group);
    }
  }, [quotes]);

  return (
    <div>
      <div ref={el} className="aspect-square w-full overflow-hidden rounded-xl border border-line" role="region" aria-label="Map of nearby dentists" />
      <p className="mt-2 flex gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden /> In network
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-warn" aria-hidden /> Out of network
        </span>
        <span>Pins at approximate neighborhood centers.</span>
      </p>
    </div>
  );
}
