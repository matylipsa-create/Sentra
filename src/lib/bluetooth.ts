export interface BluetoothDevice {
  id: string;
  name: string;
  type: 'sensor' | 'wearable' | 'camera';
  uuid: string;
  rssi: number;
  connected: boolean;
  lastUpdate: Date;
}

export interface BiometricData {
  heartRate: number;
  heartRateVariability: number;
  respiration: number;
  skinTemperature: number;
  skinConductance: number;
  oxygenSaturation: number;
  timestamp: Date;
}

class BluetoothManager {
  private devices: Map<string, BluetoothDevice> = new Map();
  private listeners: ((data: BiometricData) => void)[] = [];
  private isSupported = false;
  private server: BluetoothRemoteGATTServer | null = null;

  constructor() {
    this.isSupported = 'bluetooth' in navigator;
  }

  async scanDevices(): Promise<BluetoothDevice[]> {
    if (!this.isSupported) {
      console.warn('Bluetooth no soportado en este dispositivo');
      return this.getMockDevices();
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: 'SENTRA' },
          { namePrefix: 'HR' },
          { namePrefix: 'BioSensor' },
        ],
        optionalServices: [
          'heart_rate',
          'generic_access',
          'generic_attribute',
          '0000180d-0000-1000-8000-00805f9b34fb',
        ],
      });

      return [this.deviceToInterface(device)];
    } catch (e) {
      console.warn('Error al escanear dispositivos:', e);
      return this.getMockDevices();
    }
  }

  async connectDevice(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    try {
      if (this.isSupported) {
        // Real Bluetooth connection logic would go here
        device.connected = true;
        device.lastUpdate = new Date();
      }
      return true;
    } catch (e) {
      console.error('Error conectando:', e);
      return false;
    }
  }

  async disconnectDevice(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    device.connected = false;
    if (this.server) {
      this.server.disconnect();
      this.server = null;
    }
    return true;
  }

  subscribeToData(callback: (data: BiometricData) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private deviceToInterface(device: BluetoothDevice | any): BluetoothDevice {
    return {
      id: device.id || Math.random().toString(36),
      name: device.name || 'Dispositivo',
      type: this.inferType(device.name),
      uuid: device.uuid || '',
      rssi: Math.random() * -50 - 30,
      connected: false,
      lastUpdate: new Date(),
    };
  }

  private inferType(name: string): 'sensor' | 'wearable' | 'camera' {
    const lower = name?.toLowerCase() || '';
    if (lower.includes('camera') || lower.includes('cam')) return 'camera';
    if (lower.includes('watch') || lower.includes('band') || lower.includes('ring')) return 'wearable';
    return 'sensor';
  }

  private getMockDevices(): BluetoothDevice[] {
    const mock = [
      {
        id: 'sensor-1',
        name: 'SENTRA HR-01',
        type: 'sensor' as const,
        uuid: '180d',
        rssi: -45,
        connected: true,
        lastUpdate: new Date(),
      },
      {
        id: 'wearable-1',
        name: 'Smartwatch Zephyr',
        type: 'wearable' as const,
        uuid: '180a',
        rssi: -35,
        connected: false,
        lastUpdate: new Date(),
      },
      {
        id: 'camera-1',
        name: 'SENTRA Camera-A',
        type: 'camera' as const,
        uuid: '180e',
        rssi: -52,
        connected: true,
        lastUpdate: new Date(),
      },
    ];
    return mock;
  }

  startSimulation(): () => void {
    const interval = setInterval(() => {
      const data: BiometricData = {
        heartRate: 65 + Math.random() * 30,
        heartRateVariability: 40 + Math.random() * 20,
        respiration: 15 + Math.random() * 5,
        skinTemperature: 36 + Math.random() * 2,
        skinConductance: 2 + Math.random() * 8,
        oxygenSaturation: 98 + Math.random() * 2,
        timestamp: new Date(),
      };

      this.listeners.forEach((cb) => cb(data));
    }, 1000);

    return () => clearInterval(interval);
  }
}

export const bluetoothManager = new BluetoothManager();
