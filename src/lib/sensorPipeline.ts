import type { BiometricData } from './bluetooth';
import { supabase } from './supabase';

export interface SensorReading {
  timestamp: Date;
  deviceId: string;
  data: BiometricData;
  processed: boolean;
  alerts: string[];
}

export interface AggregatedMetrics {
  heartRateAvg: number;
  heartRateVariability: number;
  respirationPattern: string;
  stressLevel: number;
  coherence: number;
  timestamp: Date;
}

class SensorPipeline {
  private readings: SensorReading[] = [];
  private maxReadings = 300; // 5 minutes at 1Hz
  private listeners: ((metrics: AggregatedMetrics) => void)[] = [];

  addReading(deviceId: string, data: BiometricData): SensorReading {
    const reading: SensorReading = {
      timestamp: new Date(),
      deviceId,
      data,
      processed: false,
      alerts: [],
    };

    this.readings.push(reading);
    if (this.readings.length > this.maxReadings) {
      this.readings.shift();
    }

    this.processReading(reading);
    const metrics = this.computeAggregates();
    this.emit(metrics);

    return reading;
  }

  private processReading(reading: SensorReading) {
    const alerts: string[] = [];

    if (reading.data.heartRate > 120 || reading.data.heartRate < 40) {
      alerts.push('HIGH_HR');
    }

    if (reading.data.skinConductance > 8) {
      alerts.push('STRESS_DETECTED');
    }

    if (reading.data.respiration > 25) {
      alerts.push('RAPID_BREATHING');
    }

    if (reading.data.oxygenSaturation < 94) {
      alerts.push('LOW_O2');
    }

    reading.alerts = alerts;
    reading.processed = true;

    if (alerts.length > 0) {
      this.persistAlert(reading, alerts);
    }
  }

  private computeAggregates(): AggregatedMetrics {
    if (this.readings.length === 0) {
      return {
        heartRateAvg: 0,
        heartRateVariability: 0,
        respirationPattern: 'steady',
        stressLevel: 0,
        coherence: 0,
        timestamp: new Date(),
      };
    }

    const last60 = this.readings.slice(-60);
    const heartRates = last60.map((r) => r.data.heartRate);
    const respirations = last60.map((r) => r.data.respiration);
    const skinConductances = last60.map((r) => r.data.skinConductance);

    const heartRateAvg = heartRates.reduce((a, b) => a + b, 0) / heartRates.length;
    const heartRateVariability = this.calculateVariability(heartRates);

    const respirationPattern = this.classifyRespirationPattern(respirations);

    const avgSkinConductance = skinConductances.reduce((a, b) => a + b, 0) / skinConductances.length;
    const stressLevel = Math.min(100, Math.max(0, (avgSkinConductance / 10) * 100));

    const coherence = this.calculateCoherence(heartRates, respirations);

    return {
      heartRateAvg,
      heartRateVariability,
      respirationPattern,
      stressLevel,
      coherence,
      timestamp: new Date(),
    };
  }

  private calculateVariability(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private classifyRespirationPattern(rates: number[]): string {
    if (rates.length === 0) return 'unknown';

    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variability = this.calculateVariability(rates);

    if (variability < 2) return 'steady';
    if (variability < 5) return 'normal';
    if (avg > 20) return 'rapid';
    return 'irregular';
  }

  private calculateCoherence(heartRates: number[], respirations: number[]): number {
    if (heartRates.length < 2 || respirations.length < 2) return 0;

    const hrMean = heartRates.reduce((a, b) => a + b, 0) / heartRates.length;
    const respMean = respirations.reduce((a, b) => a + b, 0) / respirations.length;

    let covariance = 0;
    for (let i = 0; i < Math.min(heartRates.length, respirations.length); i++) {
      covariance += (heartRates[i] - hrMean) * (respirations[i] - respMean);
    }
    covariance /= Math.min(heartRates.length, respirations.length);

    const hrVariance = this.calculateVariability(heartRates) ** 2;
    const respVariance = this.calculateVariability(respirations) ** 2;

    if (hrVariance === 0 || respVariance === 0) return 0;

    const correlation = covariance / Math.sqrt(hrVariance * respVariance);
    return Math.max(0, Math.min(1, (correlation + 1) / 2));
  }

  private persistAlert(_reading: SensorReading, alerts: string[]) {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('security_logs').insert({
          user_id: user.id,
          severity: alerts.includes('HIGH_HR') || alerts.includes('STRESS_DETECTED') ? 'critical' : 'warning',
          source: 'sensor',
          message: `Alerta biométrica: ${alerts.join(', ')}`,
        });
      } catch (e) {
        // offline or not authed
      }
    })();
  }

  subscribe(callback: (metrics: AggregatedMetrics) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private emit(metrics: AggregatedMetrics) {
    this.listeners.forEach((cb) => cb(metrics));
  }

  getReadings(limit: number = 60): SensorReading[] {
    return this.readings.slice(-limit);
  }

  getLatestMetrics(): AggregatedMetrics {
    return this.computeAggregates();
  }
}

export const sensorPipeline = new SensorPipeline();
