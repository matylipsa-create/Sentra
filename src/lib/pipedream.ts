/**
 * @deprecated Pipeline legacy. Reemplazado por SentraMesh + BatchDispatcher.
 *
 * Cambios (auditoría 2026-01):
 *   - Eliminados TELEGRAM_BOT_TOKEN + fallback directo a api.telegram.org.
 *   - Eliminado `dispatchInteraction`: todo el tráfico de interacciones
 *     (ARM, DISARM, RESOLVE_ALERT, etc.) ahora fluye por
 *     `mesh.emit('USER_INTERACTION', payload)`. Diff #4.
 *
 * Sobrevive únicamente `dispatchEmergency` porque el módulo de vigilancia
 * (EmergencyCommandCenter) es inmutable en esta ronda de refactor.
 * TODO: en la próxima fase migrar EmergencyCommandCenter a
 * `mesh.emit('EMERGENCY_DISPATCH', payload)` y eliminar este archivo.
 */
import axios from 'axios';

const PIPEDREAM_WEBHOOK = 'https://eo4xot0qo22mfqm.m.pipedream.net';

export interface EmergencyPayload {
  camera_sector: string;
  latitude: number;
  longitude: number;
  image_url: string;
  camera_active: boolean;
  operator_biometrics: {
    name: string;
    bpm: number;
  };
}

export interface DispatchResult {
  success: boolean;
  source: 'pipedream' | 'telegram' | 'fallback';
  timestamp: Date;
  response?: unknown;
  error?: string;
}

class PipedreamOrchestrator {
  private dispatchLog: Array<{ timestamp: Date; event: string; level: 'info' | 'warning' | 'error' | 'success' }> = [];
  private maxLogs = 100;

  addLog(event: string, level: 'info' | 'warning' | 'error' | 'success' = 'info') {
    const timestamp = new Date();
    this.dispatchLog.push({ timestamp, event, level });
    if (this.dispatchLog.length > this.maxLogs) this.dispatchLog.shift();
    console.log(`[${level.toUpperCase()}] ${event}`);
  }

  getLogs() {
    return this.dispatchLog;
  }

  async dispatchEmergency(payload: EmergencyPayload): Promise<DispatchResult> {
    this.addLog('Iniciando dispatch de emergencia...', 'info');
    try {
      this.addLog('Enviando payload a Pipedream...', 'info');
      const response = await axios.post(PIPEDREAM_WEBHOOK, payload, {
        timeout: 5000,
        headers: {
          'Content-Type':       'application/json',
          'X-Emergency-Source': 'SENTRA-v2.0',
          'X-Client-Version':   '2.0.0',
        },
      });
      this.addLog(`Pipedream respuesta: ${response.status}`, 'success');
      return {
        success: true,
        source: 'pipedream',
        timestamp: new Date(),
        response: response.data,
      };
    } catch (pipedreamError) {
      // Sin fallback directo a Telegram desde el cliente — el workflow del
      // lado servidor es responsable de la retransmisión por Telegram.
      this.addLog(`Pipedream falló: ${(pipedreamError as Error).message}`, 'error');
      return {
        success: false,
        source: 'fallback',
        timestamp: new Date(),
        error: `Pipedream falló. Retransmisión via Telegram debe ejecutarla el workflow servidor. Error: ${(pipedreamError as Error).message}`,
      };
    }
  }

  formatLogsForDisplay(): string[] {
    return this.dispatchLog.map((log) => {
      const time = log.timestamp.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      return `[${time}] ${log.event}`;
    });
  }
}

export const pipedreamOrchestrator = new PipedreamOrchestrator();
