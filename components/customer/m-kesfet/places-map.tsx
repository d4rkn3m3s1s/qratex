'use client';

import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { VenueSummaryDto } from '@/lib/places/types';

/**
 * Keşfet haritası — Leaflet + OpenStreetMap (anahtarsız, ücretsiz; atıf zorunlu).
 * `ssr:false` ile yüklenir (bkz. nearby-tab). Pin'e dokunmak / klavyede Enter mekân detayını
 * açar; pinlerin erişilebilir adı mekân adıdır. Koyu temada döşemeler CSS filtresiyle koyulaşır.
 * Canlı puan çarpanı olan mekânın pini vurgulu renkte ve "×" rozetlidir.
 */
export interface PlacesMapProps {
  center: { lat: number; lng: number };
  venues: VenueSummaryDto[];
  onSelect: (dealerId: string) => void;
  labels: { region: string; you: string; select: (name: string) => string };
}

function pinIcon(boosted: boolean, label: string): L.DivIcon {
  const fill = boosted ? 'hsl(var(--warning))' : 'hsl(var(--brand))';
  const badge = boosted
    ? `<span style="position:absolute;top:-6px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:hsl(var(--surface-1));color:hsl(var(--warning-text));font:600 11px/18px system-ui;box-shadow:0 0 0 1px hsl(var(--border-strong))">${label}</span>`
    : '';
  return L.divIcon({
    className: 'qx-places-pin',
    html: `<span style="position:relative;display:block;width:30px;height:30px">${badge}<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false"><path d="M12 2c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" style="fill:${fill};stroke:hsl(var(--surface-1));stroke-width:1.5"/><circle cx="12" cy="9" r="2.6" style="fill:hsl(var(--surface-1))"/></svg></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

function FitBounds({ center, venues }: { center: { lat: number; lng: number }; venues: VenueSummaryDto[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = venues.filter((v) => v.latitude != null && v.longitude != null).map((v) => [v.latitude as number, v.longitude as number] as [number, number]);
    if (pts.length === 0) {
      map.setView([center.lat, center.lng], 14);
      return;
    }
    map.fitBounds(L.latLngBounds([[center.lat, center.lng], ...pts]), { padding: [40, 40], maxZoom: 16 });
  }, [map, center.lat, center.lng, venues]);
  return null;
}

export default function PlacesMap({ center, venues, onSelect, labels }: PlacesMapProps) {
  const pins = useMemo(
    () =>
      venues
        .filter((v) => v.latitude != null && v.longitude != null && Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
        .map((v) => ({
          v,
          icon: pinIcon(!!v.liveBoost, v.liveBoost ? `${v.liveBoost.multiplier}×` : ''),
        })),
    [venues],
  );
  return (
    <div
      role="region"
      aria-label={labels.region}
      className="h-[min(60dvh,28rem)] w-full overflow-hidden rounded-card border border-subtle dark:[&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.9)_contrast(0.9)]"
    >
      <MapContainer center={[center.lat, center.lng]} zoom={14} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {/* Kullanıcı noktası: SVG sunum özniteliği var() çözmez → sabit renk (iki temada da okunur). */}
        <CircleMarker
          center={[center.lat, center.lng]}
          radius={8}
          pathOptions={{ color: '#ffffff', fillColor: '#2563eb', fillOpacity: 0.95, weight: 3 }}
        />
        {pins.map(({ v, icon }) => (
          <Marker
            key={v.dealerId}
            position={[v.latitude as number, v.longitude as number]}
            icon={icon}
            title={labels.select(v.name)}
            alt={v.name}
            keyboard
            eventHandlers={{ click: () => onSelect(v.dealerId) }}
          />
        ))}
        <FitBounds center={center} venues={venues} />
      </MapContainer>
    </div>
  );
}
