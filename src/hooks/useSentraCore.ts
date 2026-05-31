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
  const geoWorker = useRef<Worker | null>(null);

  // Hardware autodiagnosis
  const runDiagnostics = useCallback(async () => {
    const results: HardwareDiag = {
      camera: false,
      microphone: false,
      geolocation: 'geolocation' in navigator,
      indexeddb: 'indexedDB' in window,
      serviceWorker: 'serviceWorker' in navigator,
      webWorker: typeof Worker !== 'undefined',
      ready: false,
    };

    // Camera check
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      results.camera = devices.some((d) => d.kind === 'videoinput');
    } catch { results.camera = false; }

    // Microphone check
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      results.microphone = devices.some((d) => d.kind === 'audioinput');
    } catch { results.microphone = false; }

    results.ready =
      results.geolocation &&
      results.indexeddb &&
      results.webWorker;

    setDiag(results);
    await mesh.emit('HARDWARE_DIAG', results);
    return results;
  }, []);

  // Geolocation — activated only after arming
  const startGeo = useCallback(() => {
    if (!navigator.geolocation) return;

    // Launch geo worker for Nominatim lookups
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

        // Offload reverse geocoding to worker
        geoWorker.current?.postMessage({ type: 'REVERSE_GEOCODE', lat: latitude, lon: longitude });

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
  }, []);

  // Arm / Disarm
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

  // Haptic vibration (coercion protocol)
  const triggerHaptic = useCallback((pattern: number[]) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }, []);

  // Initialize mesh and run diagnostics on mount
  useEffect(() => {
    mesh.init().then(() => runDiagnostics());

    // RTT polling
    const rttInterval = setInterval(() => {
      setRtt(mesh.getRTT());
      mesh.getPendingCount().then(setPendingMessages);
    }, 3000);

    return () => {
      clearInterval(rttInterval);
      stopGeo();
    };
  }, [runDiagnostics, stopGeo]);

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
