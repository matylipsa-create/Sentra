import { useState, useEffect, useCallback, useRef } from 'react';
import { mesh } from '../lib/SentraMesh';

export interface GeoState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string;
  armed: boolean;
}

export interface HardwareDiag {
  camera: boolean;
  microphone: boolean;
  geolocation: boolean;
  indexeddb: boolean;
  serviceWorker: boolean;
  webWorker: boolean;
  ready: boolean;
}

export function useSentraCore() {
  const [geo, setGeo] = useState<GeoState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    address: 'Adquiriendo posición...',
    armed: false,
  });
  const [diag, setDiag] = useState<HardwareDiag>({
    camera: false,
    microphone: false,
    geolocation: false,
    indexeddb: false,
    serviceWorker: false,
    webWorker: false,
    ready: false,
  });
  const [armed, setArmedState] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(0);
  const [rtt, setRtt] = useState(0);

  const geoWatchId = useRef<number | null>(null);
  const geoWorker  = useRef<Worker | null>(null);

  // Throttle de reverse-geocoding (Diff #3): solo pedimos a Nominatim si el
  // operador se desplazó al menos REGEOCODE_MIN_DISTANCE_M y pasaron al menos
  // REGEOCODE_MIN_INTERVAL_MS desde el último request. La cumple política
  // oficial de Nominatim (≤ 1 req/s) y reduce coste de red ~80 %.
  const REGEOCODE_MIN_DISTANCE_M  = 25;
  const REGEOCODE_MIN_INTERVAL_MS = 5_000;
  const lastRegeo = useRef<{ ts: number; lat: number; lon: number } | null>(null);

  function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Hardware autodiagnosis — single enumerateDevices() call covers both camera and mic
  const runDiagnostics = useCallback(async () => {
    const results: HardwareDiag = {
      camera:        false,
      microphone:    false,
      geolocation:   'geolocation' in navigator,
      indexeddb:     'indexedDB' in window,
      serviceWorker: 'serviceWorker' in navigator,
      webWorker:     typeof Worker !== 'undefined',
      ready:         false,
    };

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      results.camera     = devices.some((d) => d.kind === 'videoinput');
      results.microphone = devices.some((d) => d.kind === 'audioinput');
    } catch {
      results.camera     = false;
      results.microphone = false;
    }

    results.ready = results.geolocation && results.indexeddb && results.webWorker;

    setDiag(results);
    await mesh.emit('HARDWARE_DIAG', results);
    return results;
  }, []);

  // Geolocation — activated only after arming
  const startGeo = useCallback(() => {
    if (!navigator.geolocation) return;

    geoWorker.current = new Worker(
      new URL('../workers/sentraGeo.worker.ts', import.meta.url),
      { type: 'module' }
    );

    geoWorker.current.onmessage = (e) => {
      if (e.data.type === 'ADDRESS_RESOLVED') {
        setGeo((prev) => ({ ...prev, address: e.data.address }));
      }
    };

    geoWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGeo((prev) => ({ ...prev, latitude, longitude, accuracy }));

        // Throttle reverse-geocode (Diff #3)
        const now  = Date.now();
        const last = lastRegeo.current;
        const distance = last
          ? haversineM(last.lat, last.lon, latitude, longitude)
          : Infinity;
        const elapsed = last ? now - last.ts : Infinity;

        if (elapsed >= REGEOCODE_MIN_INTERVAL_MS && distance >= REGEOCODE_MIN_DISTANCE_M) {
          geoWorker.current?.postMessage({ type: 'REVERSE_GEOCODE', lat: latitude, lon: longitude });
          lastRegeo.current = { ts: now, lat: latitude, lon: longitude };
        }

        mesh.emit('GEO_UPDATE', { latitude, longitude, accuracy, timestamp: Date.now() });
      },
      (err) => console.warn('Geo error:', err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, []);

  const stopGeo = useCallback(() => {
    if (geoWatchId.current !== null) {
      navigator.geolocation.clearWatch(geoWatchId.current);
      geoWatchId.current = null;
    }
    geoWorker.current?.terminate();
    geoWorker.current = null;
    lastRegeo.current = null; // forzar reverse-geocode en próximo armado
  }, []);

  const arm = useCallback(async () => {
    setArmedState(true);
    setGeo((prev) => ({ ...prev, armed: true }));
    startGeo();
    mesh.measureRTT();
    await mesh.emit('SYSTEM_ARMED', { timestamp: Date.now() });
  }, [startGeo]);

  const disarm = useCallback(async () => {
    setArmedState(false);
    setGeo((prev) => ({ ...prev, armed: false }));
    stopGeo();
    await mesh.emit('SYSTEM_DISARMED', { timestamp: Date.now() });
  }, [stopGeo]);

  const triggerHaptic = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }, []);

  // One-time initialization — mesh + diagnostics. Runs once on mount.
  useEffect(() => {
    mesh.init().then(() => runDiagnostics());
    return () => stopGeo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adaptive RTT heartbeat:
  //   Armed   → poll every 3 s (tactical frequency)
  //   Standby → poll every 15 s (passive / battery-friendly)
  useEffect(() => {
    const ms = armed ? 3_000 : 15_000;
    const id = setInterval(() => {
      setRtt(mesh.getRTT());
      mesh.getPendingCount().then(setPendingMessages);
    }, ms);
    return () => clearInterval(id);
  }, [armed]);

  return {
    geo,
    diag,
    armed,
    arm,
    disarm,
    triggerHaptic,
    pendingMessages,
    rtt,
    runDiagnostics,
  };
}
