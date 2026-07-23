import { Phone, Mic, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import { useToast } from '../context/ToastContext';
import { mesh } from '../lib/SentraMesh';

export default function PanicOverlay() {
  const { state, setMode, setStatus } = useApp();
  const { speak } = useSpeech();
  const { toast } = useToast();

  if (state.daemonMode !== 'SOFT_WARN') return null;

  const handleCall = () => {
    window.location.href = 'tel:911';
  };

  const handleAudioReport = () => {
    void mesh.emit('EMERGENCY_DISPATCH', {
      reason: 'REPORTE_AUDIO',
      source: 'PANIC_OVERLAY',
      confidence: 0.9,
    });
    speak('Reporte de audio iniciado. Describe tu situación después del tono.', {
      rate: 0.85,
      pitch: 1.0,
    });
    toast({ title: 'Reporte de audio iniciado', message: 'Grabando para dispatch', variant: 'warning' });
    setMode('STABILIZE');
    setStatus('alert');
  };

  const handleCancel = () => {
    setMode('OBSERVE');
    setStatus('calm');
    speak('Alerta cancelada. Volviendo a modo observación.', { rate: 0.9 });
    toast({ title: 'Alerta cancelada', message: 'Modo OBSERVE', variant: 'info' });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(10, 12, 18, 0.92)', backdropFilter: 'blur(12px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="panic-title"
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 animate-slide-up"
        style={{
          background: 'linear-gradient(145deg, rgba(255, 0, 160, 0.08) 0%, rgba(10, 12, 18, 0.95) 100%)',
          border: '1px solid rgba(255, 0, 160, 0.3)',
          boxShadow: '0 0 40px rgba(255, 0, 160, 0.2), 0 0 0 1px rgba(255, 0, 160, 0.15)',
        }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 animate-pulse-glow"
            style={{ background: 'rgba(255, 0, 160, 0.15)', border: '1px solid rgba(255, 0, 160, 0.4)' }}
          >
            <AlertTriangle size={28} style={{ color: '#FF00A0' }} />
          </div>
          <h2 id="panic-title" className="text-xl font-bold text-white tracking-wide">
            Modo Pánico
          </h2>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            Estado: SOFT_WARN. Selecciona una acción.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleCall}
            className="flex items-center justify-center gap-3 w-full py-5 rounded-2xl font-bold text-lg transition-deep active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: '#fca5a5',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)',
            }}
            aria-label="Llamar a emergencias"
          >
            <Phone size={24} />
            <span>LLAMAR EMERGENCIA</span>
          </button>

          <button
            onClick={handleAudioReport}
            className="flex items-center justify-center gap-3 w-full py-5 rounded-2xl font-bold text-lg transition-deep active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 0, 160, 0.2) 0%, rgba(255, 0, 160, 0.1) 100%)',
              border: '1px solid rgba(255, 0, 160, 0.5)',
              color: '#f9a8d4',
              boxShadow: '0 0 20px rgba(255, 0, 160, 0.15)',
            }}
            aria-label="Iniciar reporte de audio"
          >
            <Mic size={24} />
            <span>REPORTE AUDIO</span>
          </button>

          <button
            onClick={handleCancel}
            className="flex items-center justify-center gap-3 w-full py-5 rounded-2xl font-bold text-lg transition-deep active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.15) 0%, rgba(0, 229, 255, 0.05) 100%)',
              border: '1px solid rgba(0, 229, 255, 0.4)',
              color: '#67e8f9',
            }}
            aria-label="Cancelar alerta y volver a observación"
          >
            <X size={24} />
            <span>CANCELAR</span>
          </button>
        </div>
      </div>
    </div>
  );
}
