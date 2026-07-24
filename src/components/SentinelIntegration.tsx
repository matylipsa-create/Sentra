import { useCallback, useEffect, useRef } from 'react';
import { Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { mesh, type MeshEventType } from '../lib/SentraMesh';
import { useSfx } from '../hooks/useSfx';
import { useAutoReturn } from '../hooks/useAutoReturn';
import { useSessionMetrics } from '../hooks/useSessionMetrics';
import { isHighConfidence } from '../lib/eventConfidence';
import SentinelMetricsPanel from './SentinelMetricsPanel';
import SessionReportBar from './SessionReportBar';
import { useState } from 'react';
import type { DaemonMode } from '../types';

const MESH_EVENT_MAP: Record<string, { event: string; mode: DaemonMode; label: string }> = {
  VISION_ALERT:       { event: 'vision',    mode: 'STABILIZE', label: 'Visión: detección' },
  AUDIO_ALERT:        { event: 'audio',     mode: 'STABILIZE', label: 'Audio: alerta acústica' },
  KEYWORD_DETECTED:   { event: 'keyword',   mode: 'SOFT_WARN', label: 'IA: palabra clave' },
  SPEECH_COERCION:    { event: 'coercion',  mode: 'SOFT_WARN', label: 'IA: coacción detectada' },
  EMERGENCY_DISPATCH: { event: 'dispatch',  mode: 'SOFT_WARN', label: 'Dispatch: emergencia' },
};

export default function SentinelIntegration() {
  const { state, setMode, setStatus } = useApp();
  const sfx = useSfx();
  const session = useSessionMetrics();
  const [expanded, setExpanded] = useState(false);

  const modeRef = useRef(state.daemonMode);
  modeRef.current = state.daemonMode;

  // Auto-return to ASSIST after timeout
  const handleAutoReturn = useCallback(() => {
    setMode('ASSIST');
    setStatus('calm');
    session.recordEvent('ASSIST', 'Retorno automático', 'assist');
    sfx.play('assist');
  }, [setMode, setStatus, session, sfx]);

  const autoReturn = useAutoReturn(state.daemonMode, handleAutoReturn);

  // Subscribe to mesh events → SFX + metrics + mode change
  useEffect(() => {
    const unsubs = Object.entries(MESH_EVENT_MAP).map(([meshType, cfg]) =>
      mesh.on(meshType as MeshEventType, (e) => {
        const payload = e.payload as { confidence?: number; alerta?: string; keyword?: string; label?: string };
        const confidence = payload.confidence ?? 0.5;

        sfx.play(cfg.event);
        session.recordEvent(cfg.mode, cfg.label, cfg.event);

        if (isHighConfidence(confidence) && modeRef.current === 'ASSIST') {
          setMode(cfg.mode);
          setStatus('alert');
        }
      })
    );

    // Demo mode events — local only, no Telegram dispatch
    const handleDemoEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { modo: string; label: string; event: string; color: string };
      session.recordEvent(
        (['STABILIZE', 'SOFT_WARN', 'OBSERVE'] as DaemonMode[]).find((m) => m === detail.modo) || 'OBSERVE',
        detail.label,
        detail.event,
      );
    };
    window.addEventListener('sentra_demo_event', handleDemoEvent);

    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener('sentra_demo_event', handleDemoEvent);
    };
  }, [sfx, session, setMode, setStatus]);

  // Record manual mode changes (from TopBar/PanicOverlay/etc.)
  const lastModeRef = useRef(state.daemonMode);
  useEffect(() => {
    if (lastModeRef.current !== state.daemonMode) {
      lastModeRef.current = state.daemonMode;
      if (state.daemonMode !== 'ASSIST') {
        const cfg = Object.values(MESH_EVENT_MAP).find((c) => c.mode === state.daemonMode);
        if (cfg) session.recordEvent(state.daemonMode, cfg.label, cfg.event);
      }
    }
  }, [state.daemonMode, session]);

  const sessionData = session.buildSessionData();

  return (
    <div className="border-t flex-shrink-0" style={{ borderColor: 'rgba(0,229,255,0.08)' }}>
      {/* Control bar: SFX toggle + expand/collapse */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={sfx.toggle}
          aria-pressed={sfx.enabled}
          aria-label={sfx.enabled ? 'Silenciar SFX' : 'Activar SFX'}
          title={sfx.enabled ? 'SFX activo' : 'SFX silenciado'}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all active:scale-95"
          style={{
            background: sfx.enabled ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${sfx.enabled ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: sfx.enabled ? '#00e5ff' : '#6b7280',
          }}
        >
          {sfx.enabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
          <span className="font-mono text-[8px] font-bold tracking-widest">SFX</span>
        </button>

        {/* Auto-return countdown */}
        {autoReturn.active && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.25)' }}>
            <span className="font-mono text-[8px] tracking-wider" style={{ color: '#ffb30099' }}>
              // Auto-retorno ASSIST en
            </span>
            <span className="font-mono text-[10px] font-bold" style={{ color: '#ffb300' }}>
              {autoReturn.remaining}s
            </span>
          </div>
        )}

        <button
          onClick={() => setExpanded((p) => !p)}
          aria-label={expanded ? 'Contraer panel Sentinel' : 'Expandir panel Sentinel'}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
        >
          <span className="font-mono text-[8px] font-bold tracking-widest">SENTINEL</span>
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>

      {/* Expandable Sentinel panels */}
      {expanded && (
        <>
          <SentinelMetricsPanel metrics={session.metrics} lifetime={session.lifetime} />
          <SessionReportBar
            data={sessionData}
            onClear={session.clearSession}
            onResetLifetime={session.resetLifetime}
          />
          {/* Event log */}
          {session.history.length > 0 && (
            <div className="px-3 py-1.5 max-h-24 overflow-y-auto">
              {session.history.slice(-12).reverse().map((entry, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span className="font-mono text-[8px]" style={{ color: '#4a5266' }}>
                    [{entry.time}]
                  </span>
                  <span className="font-mono text-[8px] font-bold" style={{ color: entry.color }}>
                    {entry.mode}
                  </span>
                  <span className="font-mono text-[8px]" style={{ color: '#dfe4ee' }}>
                    {entry.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
