import { notificarNucleoEvolis } from '../services/pipedream';
import { X, Phone, Shield, AlertTriangle, Siren, HeartPulse, Radio } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';

const EMERGENCY_ACTIONS = [
  {
    id: 'police',
    label: 'Llamar Policía',
    number: '911',
    icon: Shield,
    color: '#1a73e8',
    description: 'Emergencia de seguridad',
  },
  {
    id: 'ambulance',
    label: 'Ambulancia',
    number: '107',
    icon: HeartPulse,
    color: '#ef4444',
    description: 'Emergencia médica',
  },
  {
    id: 'crisis',
    label: 'Línea de Crisis',
    number: '800-290-0024',
    icon: Radio,
    color: '#10b981',
    description: 'Apoyo emocional 24/7',
  },
  {
    id: 'alert',
    label: 'Alerta SENTRA',
    icon: Siren,
    color: '#f97316',
    description: 'Activar protocolo de emergencia',
    action: 'protocol',
  },
];

export default function EmergencyDrawer() {
  const { state, setDrawer, setMode, setStatus } = useApp();
  const { speak } = useSpeech();

  if (!state.isDrawerOpen) return null;

  const handleCall = (number: string) => {
    window.location.href = `tel:${number}`;
  };

  const handleProtocol = () => {
    setMode('STABILIZE');
    setStatus('alert');
    speak('Protocolo de emergencia activado. SENTRA está monitoreando tu situación. Mantén la calma. Estoy contigo.', {
      rate: 0.75,
      pitch: 0.9,
    });
    setDrawer(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={() => setDrawer(false)}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div
          className="rounded-t-3xl border-t border-red-500/30"
          style={{ background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0e1a 100%)' }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="px-5 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-400" />
                  <h3 className="text-base font-bold text-white">Centro de Emergencias</h3>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Acciones de respuesta rápida</p>
              </div>
              <button
                onClick={() => setDrawer(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 text-gray-400 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Warning */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-5">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-300">Usa estas funciones solo en situaciones de emergencia real.</p>
            </div>

            {/* Action grid */}
            <div className="grid grid-cols-2 gap-3">
              {EMERGENCY_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
onClick={async () => {
  await notificarNucleoEvolis(action.id, "alto", Emergencia iniciada: ${action.label});

  if (action.action === 'protocol') {
    handleProtocol();
  } else if (action.number) {
    handleCall(action.number);
  }
}}
                    className="flex flex-col items-center p-4 rounded-2xl border transition-all active:scale-95"
                    style={{
                      background: `${action.color}15`,
                      borderColor: `${action.color}40`,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
                      style={{ background: `${action.color}25` }}
                    >
                      <Icon size={24} style={{ color: action.color }} />
                    </div>
                    <p className="text-sm font-bold text-white">{action.label}</p>
                    {action.number && (
                      <div className="flex items-center gap-1 mt-1">
                        <Phone size={10} style={{ color: action.color }} />
                        <span className="text-xs font-mono" style={{ color: action.color }}>
                          {action.number}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5 text-center">{action.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
