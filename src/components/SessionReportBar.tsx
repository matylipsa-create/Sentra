import { Download, FileJson, Share2, Trash2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { exportJSON, shareReport, type SessionReportData } from '../lib/sessionReport';

interface Props {
  data: SessionReportData;
  onClear: () => void;
  onResetLifetime: () => void;
}

export default function SessionReportBar({ data, onClear, onResetLifetime }: Props) {
  const { toast } = useToast();

  const handleJSON = () => {
    exportJSON(data);
    toast({ title: 'Reporte JSON descargado', variant: 'success' });
  };

  const handlePNG = async () => {
    try {
      const { data: reportData } = await shareReport(data);
      void reportData;
      toast({ title: 'Reporte PNG generado', variant: 'success' });
    } catch {
      toast({ title: 'Error generando PNG', variant: 'critical' });
    }
  };

  const handleShare = async () => {
    toast({ title: 'Generando reporte...', variant: 'info' });
    try {
      const { shared } = await shareReport(data);
      toast({
        title: shared ? 'Compartido' : 'PNG descargado',
        message: shared ? undefined : 'Web Share no disponible · descarga local',
        variant: shared ? 'success' : 'info',
      });
    } catch {
      toast({ title: 'Error al compartir', variant: 'critical' });
    }
  };

  const handleClear = () => { onClear(); toast({ title: 'Sesión limpia', variant: 'info' }); };
  const handleResetLife = () => {
    if (window.confirm('¿Borrar el histórico acumulado en este navegador?')) {
      onResetLifetime();
      toast({ title: 'Histórico borrado', variant: 'info' });
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: 'rgba(0,229,255,0.08)' }}>
      <span className="font-mono text-[9px] tracking-[0.15em]" style={{ color: '#7a8399' }}>
        S{data.session_number} · Σ {data.lifetime_total}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <button onClick={handleJSON} title="Exportar JSON"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
          <FileJson size={12} />
        </button>
        <button onClick={handlePNG} title="Exportar PNG"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
          <Download size={12} />
        </button>
        <button onClick={handleShare} title="Compartir reporte"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
          <Share2 size={12} />
        </button>
        <button onClick={handleClear} title="Limpiar sesión"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}>
          <Trash2 size={12} />
        </button>
        <button onClick={handleResetLife} title="Borrar histórico"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}
