import { useEffect, useState } from 'react';
import { bluetoothManager, type BiometricData } from '../lib/bluetooth';
import { sensorPipeline, type AggregatedMetrics } from '../lib/sensorPipeline';
import { biometricMonitor } from '../lib/biometricMonitor';
import { useApp } from '../context/AppContext';

interface DashboardState {
  biometrics: BiometricData;
  metrics: AggregatedMetrics;
  stressAlert: boolean;
  coherence: number;
}

export function useTacticalDashboard(): DashboardState {
  const { state, setStatus, setMode } = useApp();

  const initialBiometrics: BiometricData = {
    heartRate: 72,
    heartRateVariability: 45,
    respiration: 16,
    skinTemperature: 36.8,
    skinConductance: 4.2,
    oxygenSaturation: 99,
    timestamp: new Date(),
  };

  const initialMetrics: AggregatedMetrics = {
    heartRateAvg: 72,
    heartRateVariability: 45,
    respirationPattern: 'steady',
    stressLevel: 0,
    coherence: 0.8,
    timestamp: new Date(),
  };

  const [biometrics, setBiometrics] = useState<BiometricData>(initialBiometrics);
  const [metrics, setMetrics] = useState<AggregatedMetrics>(initialMetrics);
  const [stressAlert, setStressAlert] = useState(false);

  // Subscribe to biometric data from both real Bluetooth and the built-in
  // biometricMonitor (simulated hardware that responds to system stress).
  // Both feed the unified sensorPipeline → mesh → HUD alert chain.
  useEffect(() => {
    const unsubBluetooth = bluetoothManager.subscribeToData((data) => {
      setBiometrics(data);
      sensorPipeline.addReading('bluetooth', data);
    });

    biometricMonitor.start();
    const unsubBio = biometricMonitor.subscribe((snapshot) => {
      const data: BiometricData = {
        heartRate:            snapshot.bpm,
        heartRateVariability: 40 + Math.random() * 15,
        respiration:          14 + Math.random() * 6,
        skinTemperature:      36.5 + Math.random() * 1.5,
        skinConductance:      snapshot.stress === 'critical' ? 8 + Math.random() * 2
                          : snapshot.stress === 'high'     ? 6 + Math.random() * 2
                          : snapshot.stress === 'moderate' ? 4 + Math.random() * 2
                          : 2 + Math.random() * 2,
        oxygenSaturation: 97 + Math.random() * 3,
        timestamp:         snapshot.timestamp,
      };
      setBiometrics(data);
      sensorPipeline.addReading('biometric-monitor', data);
    });

    return () => {
      unsubBluetooth();
      unsubBio();
      biometricMonitor.stop();
    };
  }, []);

  // Drive biometricMonitor stress from daemonMode — hardware responds to UI state
  useEffect(() => {
    const stressMap: Record<typeof state.daemonMode, number> = {
      ASSIST:    0.2,
      STABILIZE: 0.5,
      SOFT_WARN: 0.9,
      OBSERVE:   0.3,
    };
    biometricMonitor.setSystemStress(stressMap[state.daemonMode] ?? 0.3);
  }, [state.daemonMode]);

  // Subscribe to aggregated metrics — throttle mode/status side-effects
  // to avoid duplicate AppContext writes when two hook instances are mounted
  // simultaneously (CSS-freeze layout keeps both Dashboard and Regulation alive).
  useEffect(() => {
    let lastStressWrite = 0;

    const unsubscribe = sensorPipeline.subscribe((agg) => {
      setMetrics(agg);

      const now = Date.now();
      // Rate-limit the AppContext side-effects to once per 2 s
      if (now - lastStressWrite < 2000) return;
      lastStressWrite = now;

      if (agg.stressLevel > state.biometricProfile.stressThreshold) {
        setStressAlert(true);
        if (state.daemonMode !== 'STABILIZE') setMode('STABILIZE');
        setStatus('alert');
      } else if (agg.stressLevel < state.biometricProfile.calmThreshold && stressAlert) {
        setStressAlert(false);
        setStatus('calm');
      }
    });

    return unsubscribe;
  }, [state.daemonMode, state.biometricProfile, stressAlert, setMode, setStatus]);

  return {
    biometrics,
    metrics,
    stressAlert,
    coherence: metrics.coherence,
  };
}
