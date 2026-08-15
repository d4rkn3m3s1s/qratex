'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Yakındaki işletmeler haritası — Leaflet + OpenStreetMap (TAMAMEN ÜCRETSİZ, API key yok).
 * Google Maps'in aksine kota/ücret yok. Sunucu CPU'su yakmaz (tamamen tarayıcıda).
 * ssr:false ile yüklenmeli (Leaflet `window` gerektirir) — bkz. nearby-map-lazy.tsx.
 */

export interface NearbyMapPoint {
  dealerId: string;
  businessName: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  address?: string;
  avgRating?: number;
  isOpenNow?: boolean;
}

interface NearbyMapProps {
  /** Kullanıcının konumu (mavi nokta + harita merkezi). */
  userLat: number;
  userLng: number;
  points: NearbyMapPoint[];
  /** Bir işletmeye tıklanınca (listeye scroll/detay açma için). */
  onSelect?: (dealerId: string) => void;
  heightClass?: string;
}

/** Marker ikonu: Leaflet'in varsayılan ikonu bundler'da kırılır → inline SVG data-URI. */
const pinIcon = L.divIcon({
  className: 'qratex-map-pin',
  html: `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path d="M12 2c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
      fill="hsl(262 83% 58%)" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="9" r="2.5" fill="white"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -26],
});

/** Noktalar değişince haritayı hepsini kapsayacak şekilde ayarla. */
function FitBounds({ userLat, userLng, points }: { userLat: number; userLng: number; points: NearbyMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.setView([userLat, userLng], 14);
      return;
    }
    const bounds = L.latLngBounds([[userLat, userLng], ...points.map((p) => [p.latitude, p.longitude] as [number, number])]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, userLat, userLng, points]);
  return null;
}

export default function NearbyMap({ userLat, userLng, points, onSelect, heightClass = 'h-[360px]' }: NearbyMapProps) {
  // Geçersiz koordinatlı kayıtları ele (harita patlamasın).
  const valid = useMemo(
    () => points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)),
    [points]
  );

  return (
    <div className={`${heightClass} w-full overflow-hidden rounded-2xl border border-border`}>
      <MapContainer
        center={[userLat, userLng]}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        aria-label="Yakındaki işletmeler haritası"
      >
        {/* OpenStreetMap — ücretsiz tile sunucusu. Attribution ZORUNLU (OSM lisansı). */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıda bulunanlar'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* Kullanıcı konumu */}
        <CircleMarker
          center={[userLat, userLng]}
          radius={8}
          pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}
        >
          <Popup>Buradasın</Popup>
        </CircleMarker>

        {valid.map((p) => (
          <Marker
            key={p.dealerId}
            position={[p.latitude, p.longitude]}
            icon={pinIcon}
            eventHandlers={onSelect ? { click: () => onSelect(p.dealerId) } : undefined}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{p.businessName}</div>
                {p.address && <div className="text-xs opacity-80">{p.address}</div>}
                <div className="text-xs">
                  {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`} uzakta
                  {typeof p.avgRating === 'number' && p.avgRating > 0 && ` · ⭐ ${p.avgRating.toFixed(1)}`}
                  {p.isOpenNow != null && (p.isOpenNow ? ' · 🟢 Açık' : ' · 🔴 Kapalı')}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <FitBounds userLat={userLat} userLng={userLng} points={valid} />
      </MapContainer>
    </div>
  );
}
