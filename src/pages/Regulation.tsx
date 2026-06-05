import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Volume2, VolumeX, Mic, MicOff, Cpu, Anchor, Eye, Loader, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import type { ChatMessage, AgentName } from '../types';

const REGULATION_ENDPOINT = 'https://eohmxy72d8jcync.m.pipedream.net';

const AGENT_COLORS: Record<AgentName, string> = {
  Anchor: '#10b981',
  Daemon: '#1a73e8',
  Observer: '#6366f1',
};

const AGENT_ICONS: Record<AgentName, React.ElementType> = {
  Anchor: Anchor,
  Daemon: Cpu,
  Observer: Eye,
};

// Local fallback pool — used only when Pipedream is unreachable
const FALLBACK_POOL: { agent: AgentName; text: string }[] = [
  { agent: 'Daemon', text: 'Te escucho. Estoy aquí contigo en este momento. ¿Puedes describir lo que sientes con más detalle?' },
  { agent: 'Anchor', text: 'Nota cómo tu respiración sostiene este momento. Estás presente. Estás a salvo. ¿Qué necesitas ahora?' },
  { agent: 'Observer', text: 'Desde mi posición de observación, percibo que estás procesando algo importante. Tómate el tiempo que necesites.' },
  { agent: 'Daemon', text: 'Detecto señales de tensión. Iniciando protocolo de estabilización: inhala 4s — sostén 4s — exhala 6s.' },
];

async function queryPipedream(
  userMessage: string,
  sessionId: string,
  mode: string
): Promise<{ agent: AgentName; text: string } | null> {
  try {
    const res = await fetch(REGULATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SENTRA-Version': '3.0',
        'X-Flow': 'regulation',
      },
      body: JSON.stringify({
        event_type: 'REGULATION_QUERY',
        session_id: sessionId,
        mode,
        message: userMessage,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error('[SENTRA] Pipedream regulation endpoint responded with', res.status);
      return null;
    }

    const json = await res.json();
    // Accept either { agent, text } or { response } or { message }
    const text: string = json?.text ?? json?.response ?? json?.message ?? '';
    const agent: AgentName = (json?.agent as AgentName) ?? 'Daemon';
    if (text) return { agent, text };
    return null;
  } catch (err) {
    console.error('[SENTRA] Pipedream regulation unreachable:', err);
    return null;
  }
}

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

  const agentName = msg.agent ?? 'Daemon';
  const color = AGENT_COLORS[agentName as AgentName] ?? '#1a73e8';
  const Icon = AGENT_ICONS[agentName as AgentName] ?? Cpu;

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
          {msg.fallback && (
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <WifiOff size={9} /> local
            </span>
          )}
        </div>
        <div
          className="px-4 py-3 rounded-2xl rounded-tl-sm"
          style={{ background: `${color}10`, border: `1px solid ${color}20` }}
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
  const Icon = AGENT_ICONS[agent];
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
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: color, animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function Regulation() {
  const { state } = useApp();
  const { speak, stop, isSpeaking } = useSpeech();
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
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingAgent, setTypingAgent] = useState<AgentName>('Daemon');
  const [voiceActive, setVoiceActive] = useState(state.biometricProfile.voiceEnabled);
  const [listening, setListening] = useState(false);
  const [pipedreamStatus, setPipedreamStatus] = useState<'ok' | 'fallback' | 'unknown'>('unknown');
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setTypingAgent('Daemon');
      setIsTyping(true);

      // Small delay so typing indicator renders before the async call
      await new Promise((r) => setTimeout(r, 400));

      const pipedreamResponse = await queryPipedream(text.trim(), sessionId, state.daemonMode);

      let response: { agent: AgentName; text: string };
      let isFallback = false;

      if (pipedreamResponse) {
        response = pipedreamResponse;
        setPipedreamStatus('ok');
      } else {
        // Graceful degradation to local pool
        const pick = FALLBACK_POOL[Math.floor(Math.random() * FALLBACK_POOL.length)];
        response = pick;
        isFallback = true;
        setPipedreamStatus('fallback');
      }

      setTypingAgent(response.agent);

      // Brief pause after setting the right agent on the indicator
      await new Promise((r) => setTimeout(r, 300));
      setIsTyping(false);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.text,
        agent: response.agent,
        createdAt: new Date(),
        voiceSpoken: voiceActive,
        fallback: isFallback,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (voiceActive) {
        speak(response.text, {
          rate: state.biometricProfile.voiceRate,
          pitch: state.biometricProfile.voicePitch,
          volume: state.biometricProfile.voiceVolume,
          lang: state.biometricProfile.preferredVoice,
        });
      }
    },
    [voiceActive, sessionId, speak, state.biometricProfile, state.daemonMode, isTyping]
  );

  const toggleListening = useCallback(() => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-MX';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  }, [listening]);

  const toggleVoice = useCallback(() => {
    if (isSpeaking()) stop();
    setVoiceActive((v) => !v);
  }, [isSpeaking, stop]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
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
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
            pipedreamStatus === 'fallback'
              ? 'bg-orange-500/10 border-orange-500/30'
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${pipedreamStatus === 'fallback' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
            <span className={`text-xs font-medium ${pipedreamStatus === 'fallback' ? 'text-orange-400' : 'text-emerald-400'}`}>
              {pipedreamStatus === 'fallback' ? 'Local' : 'IA Activa'}
            </span>
          </div>
        </div>
      </div>

      {/* Protocol badge */}
      <div className="py-3 flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5">
          <Cpu size={12} className="text-blue-400" />
          <span className="text-xs text-gray-400">Workflow IA · Pipedream — {state.daemonMode}</span>
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
            {isTyping ? <Loader size={18} className="animate-spin text-white" /> : <Send size={18} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}
