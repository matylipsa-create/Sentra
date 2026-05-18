import axios from 'axios';

// Hardcoded endpoints
const PIPEDREAM_WEBHOOK = 'https://eovz6sc6j9exly6.m.pipedream.net';
const TELEGRAM_BOT_TOKEN = '8156157833:AAEn86wHwB4w-bYjT0-wV15hV74P8qL2m90';
const TELEGRAM_CHAT_ID = '-1002485591325';
const TELEGRAM_SEND_PHOTO_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

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
  response?: any;
  error?: string;
}

class PipedreamOrchestrator {
  private dispatchLog: Array<{ timestamp: Date; event: string; level: 'info' | 'warning' | 'error' | 'success' }> = [];
  private maxLogs = 100;

  addLog(event: string, level: 'info' | 'warning' | 'error' | 'success' = 'info') {
    const timestamp = new Date();
    this.dispatchLog.push({ timestamp, event, level });
    if (this.dispatchLog.length > this.maxLogs) {
      this.dispatchLog.shift();
    }
    console.log(`[${level.toUpperCase()}] ${event}`);
  }

  getLogs() {
    return this.dispatchLog;
  }

  async dispatchEmergency(payload: EmergencyPayload): Promise<DispatchResult> {
    this.addLog('Iniciando dispatch de emergencia...', 'info');

    try {
      // Intentar Pipedream primero
      this.addLog('Enviando payload a Pipedream...', 'info');

      const response = await axios.post(PIPEDREAM_WEBHOOK, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Emergency-Source': 'SENTRA-v2.0',
          'X-Client-Version': '2.0.0',
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
      this.addLog(`Pipedream falló: ${(pipedreamError as any).message}`, 'warning');

      // Fallback a Telegram
      try {
        this.addLog('Activando fallback Telegram...', 'warning');
        return await this.dispatchTelegramFallback(payload);
      } catch (telegramError) {
        this.addLog(`Telegram fallback falló: ${(telegramError as any).message}`, 'error');
        return {
          success: false,
          source: 'fallback',
          timestamp: new Date(),
          error: `Ambos canales fallaron. Error final: ${(telegramError as any).message}`,
        };
      }
    }
  }

  private async dispatchTelegramFallback(payload: EmergencyPayload): Promise<DispatchResult> {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', payload.image_url);

    const caption = `🚨 EMERGENCIA SENTRA v2.0 🚨

Operador: ${payload.operator_biometrics.name}
BPM: ${payload.operator_biometrics.bpm}
Ubicación: ${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}
Sector: ${payload.camera_sector}
Cámara: ${payload.camera_active ? 'ACTIVA' : 'INACTIVA'}
Timestamp: ${new Date().toISOString()}`;

    formData.append('caption', caption);

    const response = await axios.post(TELEGRAM_SEND_PHOTO_URL, formData, {
      timeout: 5000,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    this.addLog(`Telegram enviado exitosamente (Chat ID: ${TELEGRAM_CHAT_ID})`, 'success');
    return {
      success: true,
      source: 'telegram',
      timestamp: new Date(),
      response: response.data,
    };
  }

  formatLogsForDisplay(): string[] {
    return this.dispatchLog.map((log) => {
      const time = log.timestamp.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `[${time}] ${log.event}`;
    });
  }
}

export const pipedreamOrchestrator = new PipedreamOrchestrator();
export const notificarNucleoEvolis = async (tipoEvento: string, nivelRiesgo: string, detalle: string) => {
  const PIPEDREAM_WEBHOOK_URL = "https://eoch_ypfggP.m.pipedream.net";

  try {
    const response = await fetch(PIPEDREAM_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tipo: tipoEvento,
        nivel: nivelRiesgo,
        mensaje: detalle,
        timestamp: new Date().toISOString()
      }),
    });

    if (response.ok) {
      console.log("📡 Ráfaga enviada con éxito al núcleo EVOLIS.");
    } else {
      console.warn(⚠️ Pipedream respondió con estado: ${response.status});
    }
  } catch (error) {
    console.error("❌ Falla crítica de comunicación con el servidor central:", error);
  }
};
