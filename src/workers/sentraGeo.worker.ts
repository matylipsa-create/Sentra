// SentraGeo Web Worker — Nominatim reverse geocoding + Haversine
// Returns only display_name (street/number) to minimize data overhead.

import { NOMINATIM_BASE } from '../config';

interface GeoMessage {
  type: 'REVERSE_GEOCODE' | 'CALC_DISTANCE';
  lat?: number;
  lon?: number;
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SENTRA-v3/3.0.0 (emergency-pwa)' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();

    // Return only the human-readable street address (display_name trimmed)
    const addr = data.address ?? {};
    const parts = [
      addr.road || addr.pedestrian || addr.path || addr.footway,
      addr.house_number,
      addr.suburb || addr.neighbourhood || addr.quarter,
      addr.city || addr.town || addr.village || addr.municipality,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' ') : (data.display_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  } catch {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

function haversineDistance(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): number {
  const R = 6371000;
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lon - from.lon) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

self.onmessage = async (e: MessageEvent<GeoMessage>) => {
  const msg = e.data;

  if (msg.type === 'REVERSE_GEOCODE' && msg.lat !== undefined && msg.lon !== undefined) {
    const displayName = await reverseGeocode(msg.lat, msg.lon);
    self.postMessage({ type: 'ADDRESS_RESOLVED', address: displayName, lat: msg.lat, lon: msg.lon });
  }

  if (msg.type === 'CALC_DISTANCE' && msg.from && msg.to) {
    const distance = haversineDistance(msg.from, msg.to);
    self.postMessage({ type: 'DISTANCE_RESULT', distance, from: msg.from, to: msg.to });
  }
};
