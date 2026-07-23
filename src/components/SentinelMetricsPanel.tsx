import type { DaemonMode } from '../types';
import type { SessionMetrics, LifetimeData } from '../hooks/useSessionMetrics';
import { MODE_COLORS } from '../hooks/useSessionMetrics';

const MODE_ORDER: DaemonMode[] = ['ASSIST', 'STABILIZE', 'SOFT_WARN', 'OBSERVE'];

interface Props {
  metrics: SessionMetrics;
  lifetime: LifetimeData;
}

export default function SentinelMetricsPanel({ metrics, lifetime }: Props) {
  const total = Object.values(metrics).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(metrics));

  return (
    <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(0,229,255,0.08)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[9px] tracking-[0.18em]" style={{ color: '#4a5266' }}>
          // MÉTRICAS DE SESIÓN
        </span>
        <span className="font-mono text-[9px] font-bold" style={{ color: '#dfe4ee' }}>
          TOTAL {total}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MODE_ORDER.map((mode) => {
          const count = metrics[mode] || 0;
          const pct = Math.round((count / max) * 100);
          const color = MODE_COLORS[mode];
          const lifeCount = lifetime.metrics[mode] || 0;
          return (
            <div key={mode} className="rounded-lg p-2"
              style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[8px] font-bold tracking-wider" style={{ color }}>
                  {mode}
                </span>
                <span className="font-mono text-[12px] font-bold" style={{ color: '#dfe4ee' }}>
                  {count}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}80` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-[7px]" style={{ color: '#4a5266' }}>histórico</span>
                <span className="font-mono text-[7px] font-bold" style={{ color: `${color}99` }}>
                  Σ{lifeCount}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
