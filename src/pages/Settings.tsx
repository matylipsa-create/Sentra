import { useState } from 'react';
import { Activity, Volume2, Cpu, Shield, User, ChevronRight, Info, Sliders, Video, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AgentName } from '../types';

const CAMERA_URL_KEY = 'sentra_camera_url';

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
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // ── Camera URL state ────────────────────────────────────────────────────
  const [cameraUrl, setCameraUrl]     = useState(() => localStorage.getItem(CAMERA_URL_KEY) || '');
  const [savedFlash, setSavedFlash]   = useState(false);
  const [reloadKey, setReloadKey]     = useState(0); // bumping this forces VisionPanel remount externally via key

  const saveCameraUrl = () => {
    const trimmed = cameraUrl.trim();
    localStorage.setItem(CAMERA_URL_KEY, trimmed);
    // Signal VisionPanel to reload by dispatching a storage event on the same tab
    window.dispatchEvent(new StorageEvent('storage', { key: CAMERA_URL_KEY, newValue: trimmed }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest">Sistema</p>
        <h2 className="text-lg font-bold text-white">Configuración</h2>
      </div>

      {/* Version badge */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Cpu size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">SENTRA v1.0</p>
            <p className="text-xs text-gray-500">STAR OPS + EVOLIS Core</p>
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
          onChange={(v) =>
            updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, heart_rate: v } })
          }
        />
        <Toggle
          label="Respiración"
          description="Patrón respiratorio y coherencia"
          checked={biometricProfile.sensorsEnabled.respiration}
          onChange={(v) =>
            updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, respiration: v } })
          }
        />
        <Toggle
          label="Conductancia de Piel"
          description="Detección de respuesta galvánica"
          checked={biometricProfile.sensorsEnabled.skin_conductance}
          onChange={(v) =>
            updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, skin_conductance: v } })
          }
        />
        <Toggle
          label="Movimiento"
          description="Acelerómetro y giroscopio"
          checked={biometricProfile.sensorsEnabled.motion}
          onChange={(v) =>
            updateBiometric({ sensorsEnabled: { ...biometricProfile.sensorsEnabled, motion: v } })
          }
        />
      </Section>

      {/* Thresholds */}
      <Section title="Umbrales de Regulación" icon={Sliders}>
        <SliderRow
          label="Umbral de Estrés"
          value={biometricProfile.stressThreshold}
          min={30}
          max={100}
          step={5}
          onChange={(v) => updateBiometric({ stressThreshold: v })}
          format={(v) => `${v}%`}
          color="#f97316"
        />
        <SliderRow
          label="Umbral de Calma"
          value={biometricProfile.calmThreshold}
          min={10}
          max={60}
          step={5}
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
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(v) => updateBiometric({ voiceRate: v })}
          format={(v) => v.toFixed(2) + 'x'}
        />
        <SliderRow
          label="Tono"
          value={biometricProfile.voicePitch}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={(v) => updateBiometric({ voicePitch: v })}
          format={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Volumen"
          value={biometricProfile.voiceVolume}
          min={0}
          max={1}
          step={0.05}
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
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: `${color}20`, color }}
                  >
                    {agent.mode}
                  </span>
                </div>
                <span className="text-xs text-gray-600 font-mono">{agent.activationLevel}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
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
                background:   'rgba(0,255,0,0.04)',
                border:       `1px solid ${cameraUrl ? 'rgba(0,255,0,0.25)' : 'rgba(255,255,255,0.1)'}`,
                color:        '#e5e7eb',
                caretColor:   '#00FF00',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(0,255,0,0.5)')}
              onBlur={(e)  => (e.target.style.borderColor = cameraUrl ? 'rgba(0,255,0,0.25)' : 'rgba(255,255,255,0.1)')}
            />
          </div>
          <button
            onClick={saveCameraUrl}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
            style={{
              background:   savedFlash ? 'rgba(0,255,0,0.15)' : 'rgba(0,255,0,0.08)',
              border:       `1px solid ${savedFlash ? 'rgba(0,255,0,0.6)' : 'rgba(0,255,0,0.25)'}`,
              color:        savedFlash ? '#00FF00' : '#6ee7b7',
            }}
          >
            {savedFlash
              ? <><CheckCircle size={14} /> Guardado · Stream recargando...</>
              : 'Guardar y Recargar Stream'
            }
          </button>
          {!cameraUrl && (
            <p className="text-xs text-center" style={{ color: 'rgba(0,191,255,0.4)', fontFamily: 'monospace' }}>
              Sin URL configurada — VisionPanel en espera
            </p>
          )}
        </div>
      </Section>

      {/* Security */}
      <Section title="Seguridad STAR OPS" icon={Shield}>
        <button className="flex items-center justify-between py-3 w-full text-left">
          <div>
            <p className="text-sm text-gray-200 font-medium">Exportar Registros</p>
            <p className="text-xs text-gray-500">Descargar logs de seguridad</p>
          </div>
          <ChevronRight size={16} className="text-gray-600" />
        </button>
        <button className="flex items-center justify-between py-3 w-full text-left">
          <div>
            <p className="text-sm text-gray-200 font-medium">Limpiar Historial</p>
            <p className="text-xs text-gray-500">Eliminar mensajes del chat</p>
          </div>
          <ChevronRight size={16} className="text-gray-600" />
        </button>
        <button className="flex items-center justify-between py-3 w-full text-left">
          <div>
            <p className="text-sm text-gray-200 font-medium">Restablecer Valores</p>
            <p className="text-xs text-gray-500">Restaurar configuración de fábrica</p>
          </div>
          <ChevronRight size={16} className="text-gray-600" />
        </button>
      </Section>

      {/* About */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-white/5">
        <Info size={16} className="text-gray-600 flex-shrink-0" />
        <p className="text-xs text-gray-600 leading-relaxed">
          SENTRA unifica STAR OPS y EVOLIS Core para crear un sistema integral de seguridad operacional y regulación cognitiva. Versión comercial — $150 USD.
        </p>
      </div>
    </div>
  );
}
