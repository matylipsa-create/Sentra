import { useEffect, useState } from 'react';
import { bluetoothManager, type BiometricData } from '../lib/bluetooth';
import { sensorPipeline, type AggregatedMetrics } from '../lib/sensorPipeline';
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

  // Subscribe to biometric data
  useEffect(() => {
    const unsubscribe = bluetoothManager.subscribeToData((data) => {
      setBiometrics(data);
      sensorPipeline.addReading('primary-sensor', data);
    });
    return unsubscribe;
  }, []);

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
