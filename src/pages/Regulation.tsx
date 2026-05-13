import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Volume2, VolumeX, Mic, MicOff, Cpu, Anchor, Eye, Loader } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import { supabase } from '../lib/supabase';
import type { ChatMessage, AgentName } from '../types';

const RESONANCE_RESPONSES: Record<string, { agent: AgentName; text: string }[]> = {
  default: [
    {
      agent: 'Daemon',
      text: 'Te escucho. Estoy aquí contigo en este momento. ¿Puedes describir lo que estás sintiendo con más detalle?',
    },
    {
      agent: 'Anchor',
      text: 'Nota cómo tu respiración sostiene este momento. Estás presente. Estás a salvo. ¿Qué necesitas ahora?',
    },
    {
      agent: 'Observer',
      text: 'Desde mi posición de observación, percibo que estás procesando algo importante. Tómate el tiempo que necesites.',
    },
  ],
  stress: [
    {
      agent: 'Daemon',
      text: 'Detecto señales de tensión elevada. Iniciando protocolo de estabilización. Respira conmigo: inhala por 4, sostén por 4, exhala por 6.',
    },
    {
      agent: 'Anchor',
      text: 'El estrés es información, no una amenaza. Conecta con tu cuerpo. ¿Dónde sientes la tensión físicamente?',
    },
  ],
  calm: [
    {
      agent: 'Daemon',
      text: 'Excelente estado de regulación. Tu sistema nervioso muestra coherencia. Mantén esta frecuencia.',
    },
    {
      agent: 'Observer',
      text: 'Observo equilibrio en tus patrones. Este es tu estado base óptimo. Recuérdalo.',
    },
  ],
  help: [
    {
      agent: 'Anchor',
      text: 'Estoy aquí. Siempre. Para anclar, para sostener, para acompañarte en cualquier momento que lo necesites.',
    },
  ],
};

function detectIntent(text: string): keyof typeof RESONANCE_RESPONSES {
  const lower = text.toLowerCase();
  if (lower.includes('estres') || lower.includes('ansied') || lower.includes('mal') || lower.includes('asustado') || lower.includes('miedo')) return 'stress';
  if (lower.includes('bien') || lower.includes('tranquil') || lower.includes('calm') || lower.includes('feliz')) return 'calm';
  if (lower.includes('ayuda') || lower.includes('necesito') || lower.includes('help')) return 'help';
  return 'default';
}

function getResponse(intent: keyof typeof RESONANCE_RESPONSES): { agent: AgentName; text: string } {
  const pool = RESONANCE_RESPONSES[intent];
  return pool[Math.floor(Math.random() * pool.length)];
}

const AGENT_COLORS: Record<AgentName, string> = {
  Anchor: '#10b981',
  Daemon: '#1a73e8',
  Observer: '#8b5cf6',
};

const AGENT_ICONS: Record<AgentName, React.ElementType> = {
  Anchor: Anchor,
  Daemon: Cpu,
  Observer: Eye,
};

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
        <p className="text-xs font-semibold mb-1" style={{ color }}>{agentName}</p>
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
      <div className="flex gap-1 px-4 py-3 rounded-2xl rounded-tl-sm" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
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
      content: 'Sistema EVOLIS Core activo. Protocolo de Resonancia Humana iniciado. ¿Cómo estás en este momento?',
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
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      const intent = detectIntent(text);
      const response = getResponse(intent);
      setTypingAgent(response.agent);
      setIsTyping(true);

      // Persist to Supabase
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('chat_messages').insert({
            session_id: sessionId,
            role: 'user',
            content: text.trim(),
          });
        }
      } catch {
        /* offline or not authed — continue locally */
      }

      // Simulate thinking delay
      const delay = 800 + Math.random() * 1200;
      setTimeout(async () => {
        setIsTyping(false);

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.text,
          agent: response.agent,
          createdAt: new Date(),
          voiceSpoken: voiceActive,
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

        // Persist assistant response
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('chat_messages').insert({
              session_id: sessionId,
              role: 'assistant',
              content: response.text,
              agent: response.agent,
            });
          }
        } catch {
          /* offline */
        }
      }, delay);
    },
    [voiceActive, sessionId, speak, state.biometricProfile]
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
          <p className="text-xs text-gray-500 uppercase tracking-widest">EVOLIS Core</p>
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Activo</span>
          </div>
        </div>
      </div>

      {/* Protocol badge */}
      <div className="py-3 flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5">
          <Cpu size={12} className="text-blue-400" />
          <span className="text-xs text-gray-400">Protocolo Resonancia Humana — {state.daemonMode}</span>
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
