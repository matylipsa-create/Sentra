import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bluetooth,
  Radio,
  Heart,
  Wind,
  Thermometer,
  Eye,
  Zap,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  MoreVertical,
  Grid3x3,
  Maximize2,
  RefreshCw,
  Mic,
  Phone,
} from 'lucide-react';
import { GestureRecognizer, type Gesture } from '../lib/gestures';
import { bluetoothManager, type BluetoothDevice, type BiometricData } from '../lib/bluetooth';
import { useApp } from '../context/AppContext';
import { useTacticalDashboard } from '../hooks/useTacticalDashboard';

interface GridLayout {
  columns: number;
  gap: number;
}

function BiometricCard({
  icon: Icon,
  label,
  value,
  unit,
  status,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  color: string;
}) {
  const statusColor = {
    normal: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-orange-500/30 bg-orange-500/5',
    critical: 'border-red-500/30 bg-red-500/5',
  }[status];

  const valueColor = {
    normal: 'text-emerald-400',
    warning: 'text-orange-400',
    critical: 'text-red-400',
  }[status];

  return (
    <div className={`rounded-lg p-3 border ${statusColor} backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-xs text-gray-500 px-1.5 py-0.5 rounded bg-white/5">{status.toUpperCase()}</span>
      </div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <p className={`text-xl font-bold ${valueColor}`}>{Math.round(value)}</p>
        <p className="text-xs text-gray-600">{unit}</p>
      </div>
    </div>
  );
}

function DeviceCard({ device, connected, onConnect }: { device: BluetoothDevice; connected: boolean; onConnect: () => void }) {
  const typeIcons = {
    sensor: Radio,
    wearable: Bluetooth,
    camera: Eye,
  };
  const Icon = typeIcons[device.type];

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
      <div className="flex items-start justify-between mb-2">
        <Icon size={16} className="text-blue-400" />
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-gray-500'}`} />
      </div>
      <p className="text-xs font-medium text-gray-300 mb-1">{device.name}</p>
      <p className="text-xs text-gray-600 mb-2">RSSI: {Math.round(device.rssi)} dBm</p>
      <button
        onClick={onConnect}
        className={`w-full py-1.5 rounded text-xs font-medium transition-all ${
          connected
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
        }`}
      >
        {connected ? 'CONECTADO' : 'CONECTAR'}
      </button>
    </div>
  );
}

const getStatusFromValue = (value: number, min: number, max: number, critical: number): 'normal' | 'warning' | 'critical' => {
  if (value > critical || value < min + (max - min) * 0.2) return 'critical';
  if (value > max * 0.8 || value < min + (max - min) * 0.4) return 'warning';
  return 'normal';
};

export default function TacticalDashboard() {
  const { state, setMode } = useApp();
  const { biometrics, metrics, stressAlert, coherence } = useTacticalDashboard();
  const mainRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureRecognizer | null>(null);

  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<Set<string>>(new Set(['sensor-1', 'camera-1']));
  const [gridLayout, setGridLayout] = useState<GridLayout>({ columns: 2, gap: 12 });
  const [fullscreenCard, setFullscreenCard] = useState<string | null>(null);
  const [lastGesture, setLastGesture] = useState<Gesture | null>(null);

  // Initialize gesture recognition
  useEffect(() => {
    if (!mainRef.current) return;

    gestureRef.current = new GestureRecognizer(mainRef.current);

    const unsubscribe = gestureRef.current.subscribe((gesture) => {
      setLastGesture(gesture);
      handleGesture(gesture);
    });

    return () => {
      unsubscribe();
      gestureRef.current?.destroy();
    };
  }, []);

  // Scan and load devices
  useEffect(() => {
    const loadDevices = async () => {
      const scanned = await bluetoothManager.scanDevices();
      setDevices(scanned);
    };
    loadDevices();
  }, []);


  const handleGesture = useCallback((gesture: Gesture) => {
    switch (gesture.type) {
      case 'swipe-up':
        // Cambiar a modo STABILIZE
        setMode('STABILIZE');
        break;
      case 'swipe-down':
        // Cambiar a modo OBSERVE
        setMode('OBSERVE');
        break;
      case 'pinch-zoom':
        // Cambiar layout de grid
        setGridLayout((prev) => ({
          ...prev,
          columns: gesture.intensity > 0.3 ? 3 : 2,
        }));
        break;
      case 'circular-swipe':
        // Rotación de vistas o modo ASSIST
        setMode('ASSIST');
        break;
      case 'long-press':
        // Abrir opciones del card más cercano
        break;
      case 'double-tap':
        // Fullscreen del card
        setFullscreenCard(fullscreenCard ? null : 'biometrics');
        break;
      default:
        break;
    }
  }, [setMode, fullscreenCard]);

  const handleDeviceConnect = async (deviceId: string) => {
    const isConnected = connectedDevices.has(deviceId);
    if (isConnected) {
      await bluetoothManager.disconnectDevice(deviceId);
      setConnectedDevices((prev) => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
    } else {
      await bluetoothManager.connectDevice(deviceId);
      setConnectedDevices((prev) => new Set(prev).add(deviceId));
    }
  };

  const hrStatus = getStatusFromValue(biometrics.heartRate, 60, 100, 110);
  const respStatus = getStatusFromValue(biometrics.respiration, 12, 20, 25);
  const oxyStatus = getStatusFromValue(biometrics.oxygenSaturation, 95, 100, 92);
  const tempStatus = getStatusFromValue(biometrics.skinTemperature, 36, 38, 39);

  const gridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
  }[gridLayout.columns] || 'grid-cols-2';

  if (fullscreenCard) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 gap-4">
        <button
          onClick={() => setFullscreenCard(null)}
          className="self-end px-3 py-1.5 rounded-lg bg-white/10 text-gray-400 hover:text-white transition-all"
        >
          Cerrar
        </button>
        <div className="flex-1 grid gap-4">
          <BiometricCard
            icon={Heart}
            label="Frecuencia Cardiaca"
            value={biometrics.heartRate}
            unit="BPM"
            status={hrStatus}
            color="#ef4444"
          />
          <BiometricCard
            icon={Wind}
            label="Respiración"
            value={biometrics.respiration}
            unit="RPM"
            status={respStatus}
            color="#1a73e8"
          />
          <BiometricCard
            icon={Zap}
            label="Conductancia de Piel"
            value={biometrics.skinConductance}
            unit="µS"
            status="normal"
            color="#10b981"
          />
          <BiometricCard
            icon={Thermometer}
            label="Temperatura"
            value={biometrics.skinTemperature}
            unit="°C"
            status={tempStatus}
            color="#f97316"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mainRef}
      className="flex flex-col h-full gap-4 select-none touch-none"
      style={{ userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Dashboard Táctico</p>
          <h2 className="text-lg font-bold text-white">SENTRA-Touch</h2>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all">
            <RefreshCw size={16} />
          </button>
          <button className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Mode indicator with gesture hint and stress alert */}
      <div className={`flex items-center justify-between p-3 rounded-lg border backdrop-blur-sm transition-all ${
        stressAlert
          ? 'border-red-500/30 bg-red-500/10'
          : 'border-blue-500/30 bg-blue-500/10'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full animate-pulse ${stressAlert ? 'bg-red-400' : 'bg-blue-400'}`} />
          <span className={`text-xs font-medium ${stressAlert ? 'text-red-300' : 'text-blue-300'}`}>
            Modo: {state.daemonMode} {stressAlert && '— ALERTA ESTRÉS'}
          </span>
        </div>
        <span className="text-xs text-gray-600">
          {lastGesture ? `Gesto: ${lastGesture.type}` : 'Desliza • Pellizca • Toca'}
        </span>
      </div>

      {/* Metrics strip */}
      <div className="flex gap-2 text-xs">
        <div className="flex-1 p-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-gray-600">Coherencia</p>
          <p className="font-bold text-white">{(metrics.coherence * 100).toFixed(0)}%</p>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-gray-600">Estrés</p>
          <p className={`font-bold ${metrics.stressLevel > state.biometricProfile.stressThreshold ? 'text-orange-400' : 'text-emerald-400'}`}>
            {Math.round(metrics.stressLevel)}%
          </p>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-gray-600">Patrón Resp.</p>
          <p className="font-bold text-white capitalize">{metrics.respirationPattern}</p>
        </div>
      </div>

      {/* Biometric grid */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Biometría en Tiempo Real</p>
        <div className={`grid ${gridColsClass} gap-3`} style={{ gap: `${gridLayout.gap}px` }}>
          <BiometricCard
            icon={Heart}
            label="Frecuencia Cardiaca"
            value={biometrics.heartRate}
            unit="BPM"
            status={hrStatus}
            color="#ef4444"
          />
          <BiometricCard
            icon={Wind}
            label="Respiración"
            value={biometrics.respiration}
            unit="RPM"
            status={respStatus}
            color="#1a73e8"
          />
          <BiometricCard
            icon={Zap}
            label="Conductancia"
            value={biometrics.skinConductance}
            unit="µS"
            status="normal"
            color="#10b981"
          />
          <BiometricCard
            icon={Thermometer}
            label="Temperatura"
            value={biometrics.skinTemperature}
            unit="°C"
            status={tempStatus}
            color="#f97316"
          />
          <BiometricCard
            icon={Eye}
            label="Variabilidad HR"
            value={biometrics.heartRateVariability}
            unit="ms"
            status="normal"
            color="#8b5cf6"
          />
          <BiometricCard
            icon={Radio}
            label="SpO2"
            value={biometrics.oxygenSaturation}
            unit="%"
            status={oxyStatus}
            color="#06b6d4"
          />
        </div>
      </div>

      {/* Devices section */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Dispositivos Conectados</p>
        <div className="grid grid-cols-3 gap-2">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              connected={connectedDevices.has(device.id)}
              onConnect={() => handleDeviceConnect(device.id)}
            />
          ))}
        </div>
      </div>

      {/* Network status */}
      <div className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm">
        <Wifi size={14} className="text-emerald-400" />
        <span className="text-xs text-gray-400">Red: Online</span>
        <span className="ml-auto text-xs text-gray-600">
          {connectedDevices.size}/{devices.length} dispositivos
        </span>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all active:scale-95">
          <AlertTriangle size={14} />
          <span className="text-xs font-medium">SOS</span>
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-all active:scale-95">
          <Mic size={14} />
          <span className="text-xs font-medium">Voz</span>
        </button>
      </div>
    </div>
  );
}
