import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Volume2, VolumeX, Mic, MicOff, Cpu, Anchor, Eye, Loader, WifiOff, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import { useTacticalDashboard } from '../hooks/useTacticalDashboard';
import type { ChatMessage, AgentName } from '../types';

const REGULATION_ENDPOINT = 'https://eohmxy72d8jcync.m.pipedream.net';

const AGENT_COLORS: Record<AgentName, string> = {
  Anchor:   '#10b981',
  Daemon:   '#1a73e8',
  Observer: '#6366f1',
};

const AGENT_ICONS: Record<AgentName, React.ElementType> = {
  Anchor:   Anchor,
  Daemon:   Cpu,
  Observer: Eye,
};

// Local fallback pool — used only when Pipedream is unreachable
const FALLBACK_POOL: { agent: AgentName; text: string }[] = [
  { agent: 'Daemon',   text: 'Te escucho. Estoy aquí contigo en este momento. ¿Puedes describir lo que sientes con más detalle?' },
  { agent: 'Anchor',   text: 'Nota cómo tu respiración sostiene este momento. Estás presente. Estás a salvo. ¿Qué necesitas ahora?' },
  { agent: 'Observer', text: 'Desde mi posición de observación, percibo que estás procesando algo importante. Tómate el tiempo que necesites.' },
  { agent: 'Daemon',   text: 'Detecto señales de tensión. Iniciando protocolo de estabilización: inhala 4s — sostén 4s — exhala 6s.' },
];

async function queryPipedream(
  userMessage: string,
  sessionId: string,
  mode: string
): Promise<{ agent: AgentName; text: string } | null> {
  try {
    const res = await fetch(REGULATION_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-SENTRA-Version': '3.0',
        'X-Flow':          'regulation',
      },
      body: JSON.stringify({
        event_type: 'REGULATION_QUERY',
        session_id: sessionId,
        mode,
        message:   userMessage,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text: string    = json?.text ?? json?.response ?? json?.message ?? '';
    const agent: AgentName = (json?.agent as AgentName) ?? 'Daemon';
    return text ? { agent, text } : null;
  } catch {
    return null;
  }
}

// ── Autonomous agent message builders ─────────────────────────────────────

function buildDaemonCriticalMsg(stressLevel: number): string {
  const rounded = Math.round(stressLevel);
  return `Core Evolis detecta fluctuación cognitiva. Nivel de estrés: ${rounded}% (CRÍTICO). Solicitud de confirmación háptica enviada. Iniciando protocolo de estabilización neurológica — inhala 4s · sostén 4s · exhala 6s.`;
}

function buildAnchorRegulationMsg(): string {
  return `Protocolo de Regulación cognitiva activo. Esperando confirmación de operador. ¿Cómo estás en este momento? (Opción pregrabada 2: "Alerta Activada") — Escaneo situacional en curso. Estás seguro. Respira conmigo.`;
}

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-sm bg-blue-600/30 border border-blue-500/30">
          <p className="text-sm text-white leading-relaxed">{msg.content}</p>
          <p className="text-xs text-blue-400/60 mt-1 text-right">
            {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  const agentName = (msg.agent ?? 'Daemon') as AgentName;
  const color     = AGENT_COLORS[agentName] ?? '#1a73e8';
  const Icon      = AGENT_ICONS[agentName]  ?? Cpu;
  const isAutonomous = (msg as any).autonomous === true;

  return (
    <div className="flex gap-3 items-start">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${color}20`, border: `1px solid ${color}40` }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold" style={{ color }}>{agentName}</p>
          {isAutonomous && (
            <span
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
            >
              <Activity size={8} />auto
            </span>
          )}
          {msg.fallback && (
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <WifiOff size={9} /> local
            </span>
          )}
        </div>
        <div
          className="px-4 py-3 rounded-2xl rounded-tl-sm"
          style={{
            background: isAutonomous ? `${color}14` : `${color}10`,
            border:     `1px solid ${isAutonomous ? `${color}35` : `${color}20`}`,
          }}
        >
          <p className="text-sm text-gray-200 leading-relaxed">{msg.content}</p>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          {msg.voiceSpoken && <span className="ml-2 text-emerald-600">• voz</span>}
        </p>
      </div>
    </div>
  );
}

function TypingIndicator({ agent }: { agent: AgentName }) {
  const color = AGENT_COLORS[agent];
  const Icon  = AGENT_ICONS[agent];
  return (
    <div className="flex gap-3 items-center">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20`, border: `1px solid ${color}40` }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div
        className="flex gap-1 px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: `${color}10`, border: `1px solid ${color}20` }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: color, animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

// ── Stress gauge bar ───────────────────────────────────────────────────────

function StressGauge({ level, alert }: { level: number; alert: boolean }) {
  const pct = Math.min(100, Math.max(0, level));
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : pct >= 50 ? '#eab308' : '#10b981';
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
      style={{ background: `${color}08`, borderColor: `${color}30` }}>
      <Activity size={12} style={{ color, flexShrink: 0 }} />
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, boxShadow: alert ? `0 0 8px ${color}` : 'none' }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color, minWidth: '2.5rem' }}>
        {pct.toFixed(0)}%
      </span>
      {alert && (
        <span className="text-xs font-bold tracking-widest animate-pulse" style={{ color: '#ef4444' }}>
          CRÍTICO
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Regulation() {
  const { state } = useApp();
  const { speak, stop, isSpeaking } = useSpeech();
  const { metrics, stressAlert } = useTacticalDashboard();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Sistema SENTRA activo. Protocolo de Regulación Cognitiva iniciado. ¿Cómo estás en este momento?',
      agent: 'Daemon',
      createdAt: new Date(),
      voiceSpoken: false,
    },
  ]);
  const [input,          setInput]          = useState('');
  const [isTyping,       setIsTyping]        = useState(false);
  const [typingAgent,    setTypingAgent]     = useState<AgentName>('Daemon');
  const [voiceActive,    setVoiceActive]     = useState(state.biometricProfile.voiceEnabled);
  const [listening,      setListening]       = useState(false);
  const [pipedreamStatus, setPipedreamStatus] = useState<'ok' | 'fallback' | 'unknown'>('unknown');
  const [sessionId]     = useState(() => crypto.randomUUID());
  const bottomRef        = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef   = useRef<any>(null);

  // Guard refs so autonomous messages fire exactly once per threshold crossing
  const daemonAlertFiredRef  = useRef(false);
  const anchorAlertFiredRef  = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Autonomous Daemon message — fires once when stress >= 90% ─────────────
  useEffect(() => {
    const stress = metrics.stressLevel;

    if (stress >= 90 && !daemonAlertFiredRef.current) {
      daemonAlertFiredRef.current = true;

      const msg: ChatMessage & { autonomous: boolean } = {
        id:          crypto.randomUUID(),
        role:        'assistant',
        content:     buildDaemonCriticalMsg(stress),
        agent:       'Daemon',
        createdAt:   new Date(),
        voiceSpoken: voiceActive,
        autonomous:  true,
      };
      setMessages((prev) => [...prev, msg]);

      if (voiceActive) {
        speak(msg.content, {
          rate:   state.biometricProfile.voiceRate,
          pitch:  state.biometricProfile.voicePitch,
          volume: state.biometricProfile.voiceVolume,
          lang:   state.biometricProfile.preferredVoice,
        });
      }
    }

    // Reset guard when stress drops below 75 so next spike can trigger again
    if (stress < 75) daemonAlertFiredRef.current = false;
  }, [metrics.stressLevel, voiceActive, speak, state.biometricProfile]);

  // ── Autonomous Anchor message — fires once when mode shifts to STABILIZE ──
  useEffect(() => {
    if (state.daemonMode === 'STABILIZE' && !anchorAlertFiredRef.current) {
      anchorAlertFiredRef.current = true;

      const msg: ChatMessage & { autonomous: boolean } = {
        id:          crypto.randomUUID(),
        role:        'assistant',
        content:     buildAnchorRegulationMsg(),
        agent:       'Anchor',
        createdAt:   new Date(),
        voiceSpoken: voiceActive,
        autonomous:  true,
      };
      setMessages((prev) => [...prev, msg]);

      if (voiceActive) {
        speak(msg.content, {
          rate:   state.biometricProfile.voiceRate,
          pitch:  state.biometricProfile.voicePitch,
          volume: state.biometricProfile.voiceVolume,
          lang:   state.biometricProfile.preferredVoice,
        });
      }
    }

    if (state.daemonMode !== 'STABILIZE') anchorAlertFiredRef.current = false;
  }, [state.daemonMode, voiceActive, speak, state.biometricProfile]);

  // ── User-initiated chat ───────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;

      const userMsg: ChatMessage = {
        id:        crypto.randomUUID(),
        role:      'user',
        content:   text.trim(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setTypingAgent('Daemon');
      setIsTyping(true);

      await new Promise((r) => setTimeout(r, 400));

      const pipedreamResponse = await queryPipedream(text.trim(), sessionId, state.daemonMode);
      let response: { agent: AgentName; text: string };
      let isFallback = false;

      if (pipedreamResponse) {
        response = pipedreamResponse;
        setPipedreamStatus('ok');
      } else {
        response   = FALLBACK_POOL[Math.floor(Math.random() * FALLBACK_POOL.length)];
        isFallback = true;
        setPipedreamStatus('fallback');
      }

      setTypingAgent(response.agent);
      await new Promise((r) => setTimeout(r, 300));
      setIsTyping(false);

      const assistantMsg: ChatMessage = {
        id:          crypto.randomUUID(),
        role:        'assistant',
        content:     response.text,
        agent:       response.agent,
        createdAt:   new Date(),
        voiceSpoken: voiceActive,
        fallback:    isFallback,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (voiceActive) {
        speak(response.text, {
          rate:   state.biometricProfile.voiceRate,
          pitch:  state.biometricProfile.voicePitch,
          volume: state.biometricProfile.voiceVolume,
          lang:   state.biometricProfile.preferredVoice,
        });
      }
    },
    [voiceActive, sessionId, speak, state.biometricProfile, state.daemonMode, isTyping]
  );

  const toggleListening = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRec();
    recognition.lang           = 'es-MX';
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognitionRef.current     = recognition;
    recognition.onresult = (e: any) => { setInput(e.results[0][0].transcript); };
    recognition.onend    = () => setListening(false);
    recognition.start();
    setListening(true);
  }, [listening]);

  const toggleVoice = useCallback(() => {
    if (isSpeaking()) stop();
    setVoiceActive((v) => !v);
  }, [isSpeaking, stop]);

  const stressLevel = metrics.stressLevel;
  const modeColor: Record<string, string> = {
    ASSIST:    '#1a73e8',
    STABILIZE: '#ef4444',
    OBSERVE:   '#10b981',
  };
  const currentModeColor = modeColor[state.daemonMode] ?? '#1a73e8';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">SENTRA</p>
          <h2 className="text-lg font-bold text-white">Regulación Cognitiva</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleVoice}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              voiceActive
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                : 'bg-white/5 border-white/10 text-gray-500'
            }`}
          >
            {voiceActive ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all"
            style={{
              background:   `${currentModeColor}10`,
              borderColor:  `${currentModeColor}30`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: currentModeColor }}
            />
            <span className="text-xs font-medium" style={{ color: currentModeColor }}>
              {state.daemonMode}
            </span>
          </div>
        </div>
      </div>

      {/* Stress gauge — live telemetry bar */}
      <div className="py-2">
        <StressGauge level={stressLevel} alert={stressAlert} />
      </div>

      {/* Pipedream status */}
      <div className="pb-2 flex justify-center">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
          pipedreamStatus === 'fallback'
            ? 'bg-orange-500/10 border-orange-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            pipedreamStatus === 'fallback' ? 'bg-orange-400' : 'bg-emerald-400'
          }`} />
          <span className={`text-xs font-medium ${
            pipedreamStatus === 'fallback' ? 'text-orange-400' : 'text-emerald-400'
          }`}>
            {pipedreamStatus === 'fallback' ? 'Modo local' : 'IA Activa · Pipedream'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1" style={{ minHeight: 0 }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isTyping && <TypingIndicator agent={typingAgent} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-white/10">
        <div className="flex gap-2 items-end">
          <button
            onClick={toggleListening}
            className={`w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all ${
              listening
                ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
                : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-400'
            }`}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Escribe o habla con SENTRA..."
              rows={1}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
              style={{ maxHeight: '120px' }}
            />
          </div>

          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 flex-shrink-0"
          >
            {isTyping
              ? <Loader size={18} className="animate-spin text-white" />
              : <Send size={18} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}
