// SentraGeo Web Worker — geolocation calculations + Nominatim reverse geocoding
// Runs off main thread to prevent UI jank during address resolution.

interface GeoMessage {
  type: 'REVERSE_GEOCODE' | 'CALC_DISTANCE';
  lat?: number;
  lon?: number;
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SENTRA-v3/3.0.0 (emergency-app)' },
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    const a = data.address;
    const parts = [
      a.road || a.pedestrian || a.footway,
      a.house_number,
      a.suburb || a.neighbourhood,
      a.city || a.town || a.village,
      a.state,
    ].filter(Boolean);
    return parts.join(', ') || data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

function haversineDistance(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): number {
  const R = 6371000; // metres
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

self.onmessage = async (e: MessageEvent<GeoMessage>) => {
  const msg = e.data;

  if (msg.type === 'REVERSE_GEOCODE' && msg.lat !== undefined && msg.lon !== undefined) {
    const address = await reverseGeocode(msg.lat, msg.lon);
    self.postMessage({ type: 'ADDRESS_RESOLVED', address, lat: msg.lat, lon: msg.lon });
  }

  if (msg.type === 'CALC_DISTANCE' && msg.from && msg.to) {
    const distance = haversineDistance(msg.from, msg.to);
    self.postMessage({ type: 'DISTANCE_RESULT', distance, from: msg.from, to: msg.to });
  }
};
