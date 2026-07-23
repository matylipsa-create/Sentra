export interface BiometricSnapshot {
  bpm: number;
  timestamp: Date;
  trend: 'stable' | 'increasing' | 'decreasing';
  stress: 'low' | 'moderate' | 'high' | 'critical';
}

class BiometricMonitor {
  private currentBpm = 75;
  private previousBpm = 75;
  private listeners: ((snapshot: BiometricSnapshot) => void)[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private systemStress = 0.5; // 0-1 scale

  start() {
    if (this.interval) return;

    this.interval = setInterval(() => {
      this.updateBpm();
      this.emit();
    }, 1000); // Update every second
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private updateBpm() {
    this.previousBpm = this.currentBpm;

    // Fluctuación realista basada en estrés del sistema
    const baseChange = (Math.random() - 0.5) * 4; // -2 a +2
    const stressInfluence = this.systemStress * 20; // 0 a 20
    const randomStress = (Math.random() - 0.5) * stressInfluence;

    this.currentBpm += baseChange + randomStress;

    // Mantener entre 75 y 115 BPM
    this.currentBpm = Math.max(75, Math.min(115, this.currentBpm));
    this.currentBpm = Math.round(this.currentBpm);
  }

  private emit() {
    const snapshot: BiometricSnapshot = {
      bpm: this.currentBpm,
      timestamp: new Date(),
      trend: this.currentBpm > this.previousBpm ? 'increasing' : this.currentBpm < this.previousBpm ? 'decreasing' : 'stable',
      stress: this.getStressLevel(),
    };

    this.listeners.forEach((cb) => cb(snapshot));
  }

  private getStressLevel(): 'low' | 'moderate' | 'high' | 'critical' {
    if (this.currentBpm < 80) return 'low';
    if (this.currentBpm < 90) return 'moderate';
    if (this.currentBpm < 105) return 'high';
    return 'critical';
  }

  subscribe(callback: (snapshot: BiometricSnapshot) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  setSystemStress(stress: number) {
    this.systemStress = Math.max(0, Math.min(1, stress));
  }

  getCurrentBpm(): number {
    return this.currentBpm;
  }

  getCurrentSnapshot(): BiometricSnapshot {
    return {
      bpm: this.currentBpm,
      timestamp: new Date(),
      trend: this.currentBpm > this.previousBpm ? 'increasing' : this.currentBpm < this.previousBpm ? 'decreasing' : 'stable',
      stress: this.getStressLevel(),
    };
  }
}

export const biometricMonitor = new BiometricMonitor();
