import { useState } from 'react';
import { Activity, Volume2, Cpu, Shield, Info, Sliders, Video, CheckCircle, Download, Trash2, RotateCcw, Radio, Send, FlaskConical } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { mesh } from '../lib/SentraMesh';
import { useDemoEventGenerator } from '../hooks/useDemoEventGenerator';
import type { AgentName } from '../types';

const CAMERA_URL_KEY  = 'sentra_camera_url';
const TELEGRAM_ID_KEY = 'sentra_telegram_chat_id';
const PIPEDREAM_KEY   = 'sentra_pipedream_url';

const DEFAULT_BIOMETRIC_RESET = {
  voiceEnabled: true,
  voiceRate: 0.85,
  voicePitch: 1.0,
  voiceVolume: 1.0,
  preferredVoice: 'es-MX',
  sensorsEnabled: { heart_rate: true, respiration: true, skin_conductance: false, motion: true },
  stressThreshold: 70,
  calmThreshold: 40,
};

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm text-gray-200 font-medium">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${
          checked ? 'bg-blue-500' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? 'left-6' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  color = '#1a73e8',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  color?: string;
}) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-300">{label}</p>
        <span className="text-sm font-mono font-bold" style={{ color }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
        <Icon size={16} className="text-blue-400" />
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4 divide-y divide-white/5">{children}</div>
    </div>
  );
}

const AGENT_COLORS: Record<AgentName, string> = {
  Anchor: '#10b981',
  Daemon: '#1a73e8',
  Observer: '#6366f1',
};

export default function Settings() {
  const { state, updateBiometric, updateAgent } = useApp();
  const { biometricProfile } = state;
  const [cameraUrl,     setCameraUrl]     = useState(() => localStorage.getItem(CAMERA_URL_KEY) || '');
  const [telegramId,    setTelegramId]    = useState(() => localStorage.getItem(TELEGRAM_ID_KEY) || '');
  const [pipedreamUrl,  setPipedreamUrl]  = useState(() => localStorage.getItem(PIPEDREAM_KEY) || '');
  const [savedFlash,    setSavedFlash]    = useState(false);
  const [chanFlash,     setChanFlash]     = useState(false);
  const [actionFlash,   setActionFlash]   = useState<'export' | 'clear' | 'reset' | null>(null);
  const [testFlash,     setTestFlash]     = useState(false);

  const saveCameraUrl = () => {
    const trimmed = cameraUrl.trim();
    localStorage.setItem(CAMERA_URL_KEY, trimmed);
    window.dispatchEvent(new StorageEvent('storage', { key: CAMERA_URL_KEY, newValue: trimmed }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const savePerimeterChannel = () => {
    localStorage.setItem(TELEGRAM_ID_KEY, telegramId.trim());
    localStorage.setItem(PIPEDREAM_KEY,   pipedreamUrl.trim());
    // Notify SentraMesh immediately so next emit picks up the new config
    window.dispatchEvent(new CustomEvent('sentra_config_updated', {
      detail: { telegramChatId: telegramId.trim(), pipedreamUrl: pipedreamUrl.trim() },
    }));
    setChanFlash(true);
    setTimeout(() => setChanFlash(false), 2500);
  };

  const testPerimeterChannel = async () => {
    setTestFlash(true);
    await mesh.emit('HARDWARE_DIAG', {
      test: true,
      message: '🧪 SENTRA TEST — Canal Perimetral verificado.',
      chatId: telegramId.trim() || 'default',
      ts: Date.now(),
    });
    setTimeout(() => setTestFlash(false), 2500);
  };

  const handleExportLogs = async () => {
    try {
      const events = await mesh.getAllEvents();
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentra_logs_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setActionFlash('export');
      setTimeout(() => setActionFlash(null), 2000);
    } catch (err) {
      console.error('[SENTRA] Export logs failed:', err);
    }
  };

  const handleClearHistory = async () => {
    try {
      await mesh.clearAllEvents();
      setActionFlash('clear');
      setTimeout(() => setActionFlash(null), 2000);
    } catch (err) {
      console.error('[SENTRA] Clear history failed:', err);
    }
  };

  const handleResetDefaults = () => {
    updateBiometric(DEFAULT_BIOMETRIC_RESET);
    updateAgent({ name: 'Anchor',   mode: 'ASSIST',   status: 'calm', activationLevel: 75 });
    updateAgent({ name: 'Daemon',   mode: 'ASSIST',   status: 'calm', activationLevel: 88 });
    updateAgent({ name: 'Observer', mode: 'OBSERVE',  status: 'idle', activationLevel: 50 });
    setActionFlash('reset');
    setTimeout(() => setActionFlash(null), 2000);
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest">SENTRA</p>
        <h2 className="text-lg font-bold text-white">Configuración</h2>
      </div>

      {/* Version badge */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Cpu size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">SENTRA v3.0</p>
            <p className="text-xs text-gray-500">Sistema de Seguridad Operacional</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400">Online</span>
        </div>
      </div>

      {/* Biometric sensors */}
      <Section title="Sensores Biométricos" icon={Activity}>
        <Toggle
          label="Frecuencia Cardiaca"
          description="Monitoreo continuo de pulso"
          checked={biometricProfile.sensorsEnabled.heart_rate}
          onChange={(v) => updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, heart_rate: v } })}
        />
        <Toggle
          label="Respiración"
          description="Patrón respiratorio y coherencia"
          checked={biometricProfile.sensorsEnabled.respiration}
          onChange={(v) => updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, respiration: v } })}
        />
        <Toggle
          label="Conductancia de Piel"
          description="Detección de respuesta galvánica"
          checked={biometricProfile.sensorsEnabled.skin_conductance}
          onChange={(v) => updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, skin_conductance: v } })}
        />
        <Toggle
          label="Movimiento"
          description="Acelerómetro y giroscopio"
          checked={biometricProfile.sensorsEnabled.motion}
          onChange={(v) => updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, motion: v } })}
        />
      </Section>

      {/* Thresholds */}
      <Section title="Umbrales de Regulación" icon={Sliders}>
        <SliderRow
          label="Umbral de Estrés"
          value={biometricProfile.stressThreshold}
          min={30} max={100} step={5}
          onChange={(v) => updateBiometric({ stressThreshold: v })}
          format={(v) => `${v}%`}
          color="#f97316"
        />
        <SliderRow
          label="Umbral de Calma"
          value={biometricProfile.calmThreshold}
          min={10} max={60} step={5}
          onChange={(v) => updateBiometric({ calmThreshold: v })}
          format={(v) => `${v}%`}
          color="#10b981"
        />
      </Section>

      {/* Voice synthesis */}
      <Section title="Síntesis de Voz" icon={Volume2}>
        <Toggle
          label="Síntesis de Voz Activada"
          description="Mensajes de regulación por altavoz"
          checked={biometricProfile.voiceEnabled}
          onChange={(v) => updateBiometric({ voiceEnabled: v })}
        />
        <SliderRow
          label="Velocidad de habla"
          value={biometricProfile.voiceRate}
          min={0.5} max={1.5} step={0.05}
          onChange={(v) => updateBiometric({ voiceRate: v })}
          format={(v) => v.toFixed(2) + 'x'}
        />
        <SliderRow
          label="Tono"
          value={biometricProfile.voicePitch}
          min={0.5} max={2.0} step={0.1}
          onChange={(v) => updateBiometric({ voicePitch: v })}
          format={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Volumen"
          value={biometricProfile.voiceVolume}
          min={0} max={1} step={0.05}
          onChange={(v) => updateBiometric({ voiceVolume: v })}
          format={(v) => Math.round(v * 100) + '%'}
        />
      </Section>

      {/* Agents */}
      <Section title="Perfiles de Agentes" icon={Cpu}>
        {state.agents.map((agent) => {
          const color = AGENT_COLORS[agent.name];
          return (
            <div key={agent.name} className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <p className="text-sm font-semibold text-gray-200">{agent.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                    {agent.mode}
                  </span>
                </div>
                <span className="text-xs text-gray-600 font-mono">{agent.activationLevel}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={agent.activationLevel}
                onChange={(e) => updateAgent({ name: agent.name, activationLevel: Number(e.target.value) })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${color} 0%, ${color} ${agent.activationLevel}%, rgba(255,255,255,0.1) ${agent.activationLevel}%, rgba(255,255,255,0.1) 100%)`,
                }}
              />
              <p className="text-xs text-gray-600 mt-1">Nivel de Activación</p>
            </div>
          );
        })}
      </Section>

      {/* Camera IP */}
      <Section title="Cámara IP · Stream" icon={Video}>
        <div className="py-3 flex flex-col gap-3">
          <div>
            <p className="text-sm text-gray-200 font-medium mb-1">URL de Stream de Cámara</p>
            <p className="text-xs text-gray-500 mb-2">
              Formato: <span className="font-mono text-gray-400">http://192.168.x.x:8080/video</span>
            </p>
            <input
              type="url"
              value={cameraUrl}
              onChange={(e) => setCameraUrl(e.target.value)}
              placeholder="http://192.168.1.50:8080/video"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none transition-all"
              style={{
                background: 'rgba(0,255,0,0.04)',
                border: `1px solid ${cameraUrl ? 'rgba(0,255,0,0.25)' : 'rgba(255,255,255,0.1)'}`,
                color: '#e5e7eb',
                caretColor: '#00FF00',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,255,0,0.5)')}
              onBlur={(e) => (e.target.style.borderColor = cameraUrl ? 'rgba(0,255,0,0.25)' : 'rgba(255,255,255,0.1)')}
            />
          </div>
          <button
            onClick={saveCameraUrl}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
            style={{
              background: savedFlash ? 'rgba(0,255,0,0.15)' : 'rgba(0,255,0,0.08)',
              border: `1px solid ${savedFlash ? 'rgba(0,255,0,0.6)' : 'rgba(0,255,0,0.25)'}`,
              color: savedFlash ? '#00FF00' : '#6ee7b7',
            }}
          >
            {savedFlash ? <><CheckCircle size={14} /> Guardado · Stream recargando...</> : 'Guardar y Recargar Stream'}
          </button>
          {!cameraUrl && (
            <p className="text-xs text-center" style={{ color: 'rgba(0,191,255,0.4)', fontFamily: 'monospace' }}>
              Sin URL configurada — VisionPanel en espera
            </p>
          )}
        </div>
      </Section>

      {/* Perimeter Channel — Telegram + Pipedream */}
      <Section title="Canal Perimetral" icon={Radio}>
        <div className="py-3 flex flex-col gap-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Configura el destino de las alertas tácticas. Las notificaciones de Código Rojo y eventos de coacción serán retransmitidas a este canal en tiempo real.
          </p>

          {/* Telegram Chat ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Telegram Chat ID
            </label>
            <p className="text-xs text-gray-600">
              ID numérico del canal o grupo (ej. <span className="font-mono text-gray-500">-1001234567890</span>)
            </p>
            <input
              type="text"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="-1001234567890"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono outline-none transition-all"
              style={{
                background: 'rgba(0,191,255,0.04)',
                border: `1px solid ${telegramId ? 'rgba(0,191,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: '#e5e7eb',
                caretColor: '#00BFFF',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,191,255,0.55)')}
              onBlur={(e) => (e.target.style.borderColor = telegramId ? 'rgba(0,191,255,0.3)' : 'rgba(255,255,255,0.08)')}
            />
          </div>

          {/* Pipedream URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              URL Webhook Pipedream
            </label>
            <p className="text-xs text-gray-600">
              Endpoint de orquestación SENTRA Cerebro
            </p>
            <input
              type="url"
              value={pipedreamUrl}
              onChange={(e) => setPipedreamUrl(e.target.value)}
              placeholder="https://eoXXX.m.pipedream.net"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono outline-none transition-all"
              style={{
                background: 'rgba(0,191,255,0.04)',
                border: `1px solid ${pipedreamUrl ? 'rgba(0,191,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: '#e5e7eb',
                caretColor: '#00BFFF',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,191,255,0.55)')}
              onBlur={(e) => (e.target.style.borderColor = pipedreamUrl ? 'rgba(0,191,255,0.3)' : 'rgba(255,255,255,0.08)')}
            />
          </div>

          {/* Live status */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${telegramId && pipedreamUrl ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-xs font-mono" style={{ color: telegramId && pipedreamUrl ? '#6ee7b7' : '#4b5563' }}>
              {telegramId && pipedreamUrl
                ? `Canal activo · ${telegramId.slice(0, 14)}…`
                : 'Sin configurar — usando canal por defecto'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={savePerimeterChannel}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: chanFlash ? 'rgba(0,191,255,0.18)' : 'rgba(0,191,255,0.08)',
                border: `1px solid ${chanFlash ? 'rgba(0,191,255,0.6)' : 'rgba(0,191,255,0.25)'}`,
                color: chanFlash ? '#00BFFF' : '#67e8f9',
              }}
            >
              {chanFlash ? <><CheckCircle size={14} /> Guardado</> : 'Guardar Canal'}
            </button>
            <button
              onClick={testPerimeterChannel}
              disabled={!telegramId || !pipedreamUrl}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: testFlash ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${testFlash ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.25)'}`,
                color: testFlash ? '#10b981' : '#6ee7b7',
              }}
            >
              {testFlash ? <CheckCircle size={14} /> : <Send size={14} />}
              <span>{testFlash ? 'Enviado' : 'Test'}</span>
            </button>
          </div>
        </div>
      </Section>

      {/* Security */}
      <Section title="Seguridad SENTRA" icon={Shield}>
        <button
          onClick={handleExportLogs}
          className="flex items-center justify-between py-3 w-full text-left group"
        >
          <div>
            <p className="text-sm text-gray-200 font-medium">
              {actionFlash === 'export' ? 'Descarga iniciada' : 'Exportar Registros'}
            </p>
            <p className="text-xs text-gray-500">Descargar eventos de SentraMesh como JSON</p>
          </div>
          {actionFlash === 'export'
            ? <CheckCircle size={16} className="text-emerald-400" />
            : <Download size={16} className="text-gray-600 group-hover:text-blue-400 transition-colors" />}
        </button>
        <button
          onClick={handleClearHistory}
          className="flex items-center justify-between py-3 w-full text-left group"
        >
          <div>
            <p className="text-sm text-gray-200 font-medium">
              {actionFlash === 'clear' ? 'Cola vaciada' : 'Limpiar Historial'}
            </p>
            <p className="text-xs text-gray-500">Vaciar la cola de eventos almacenados localmente</p>
          </div>
          {actionFlash === 'clear'
            ? <CheckCircle size={16} className="text-emerald-400" />
            : <Trash2 size={16} className="text-gray-600 group-hover:text-red-400 transition-colors" />}
        </button>
        <button
          onClick={handleResetDefaults}
          className="flex items-center justify-between py-3 w-full text-left group"
        >
          <div>
            <p className="text-sm text-gray-200 font-medium">
              {actionFlash === 'reset' ? 'Valores restablecidos' : 'Restablecer Valores'}
            </p>
            <p className="text-xs text-gray-500">Restaurar umbrales y agentes a configuración de fábrica</p>
          </div>
          {actionFlash === 'reset'
            ? <CheckCircle size={16} className="text-emerald-400" />
            : <RotateCcw size={16} className="text-gray-600 group-hover:text-orange-400 transition-colors" />}
        </button>
      </Section>

      {/* Demo Mode */}
      <DemoModeSection />

      {/* About */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-white/5">
        <Info size={16} className="text-gray-600 flex-shrink-0" />
        <p className="text-xs text-gray-600 leading-relaxed">
          SENTRA — Sistema integral de seguridad operacional y regulación cognitiva. Versión comercial — $150 USD.
        </p>
      </div>
    </div>
  );
}

function DemoModeSection() {
  const { demoActive, toggleDemo } = useDemoEventGenerator();

  return (
    <Section title="Modo Demo" icon={<FlaskConical size={16} className="text-blue-400" />}>
      <div className="p-4 rounded-xl border border-white/5 bg-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-300">Generador de eventos automáticos</p>
            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
              Inyecta un evento aleatorio cada 8s en el registro (máx. 20). No envía alertas reales.
            </p>
          </div>
          <button
            onClick={toggleDemo}
            role="switch"
            aria-checked={demoActive}
            aria-label="Modo demo"
            className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
            style={{
              background: demoActive ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.1)',
              border: `1px solid ${demoActive ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
            }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                left: demoActive ? '22px' : '2px',
                background: demoActive ? '#00e5ff' : '#6b7280',
              }}
            />
          </button>
        </div>
        {demoActive && (
          <div className="flex items-center gap-2 mt-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <p className="text-[10px] font-mono tracking-wider text-cyan-400/80" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              DEMO ACTIVO · Generando eventos cada 8s
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
