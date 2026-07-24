import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import type { AppState, NavTab, DaemonMode, AgentStatus, Agent } from '../types';

const DEFAULT_BIOMETRIC = {
  voiceEnabled: true,
  voiceRate: 0.85,
  voicePitch: 1.0,
  voiceVolume: 1.0,
  preferredVoice: 'es-MX',
  sensorsEnabled: { heart_rate: true, respiration: true, skin_conductance: false, motion: true },
  stressThreshold: 70,
  calmThreshold: 40,
};

const DEFAULT_AGENTS: Agent[] = [
  { name: 'Anchor', mode: 'ASSIST', status: 'calm', activationLevel: 75, lastActivity: new Date() },
  { name: 'Daemon', mode: 'ASSIST', status: 'calm', activationLevel: 88, lastActivity: new Date() },
  { name: 'Observer', mode: 'OBSERVE', status: 'idle', activationLevel: 50, lastActivity: new Date() },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

const INITIAL_STATE: AppState = {
  activeTab: 'dashboard',
  daemonMode: loadFromStorage('sentra_mode', 'ASSIST') as DaemonMode,
  daemonStatus: loadFromStorage('sentra_status', 'calm') as AgentStatus,
  agents: loadFromStorage('sentra_agents', DEFAULT_AGENTS),
  isDrawerOpen: false,
  biometricProfile: loadFromStorage('sentra_biometric', DEFAULT_BIOMETRIC),
  armed: loadFromStorage('sentra_armed', false) as boolean,
  armedAt: loadFromStorage('sentra_armed_at', null) as number | null,
};

type Action =
  | { type: 'SET_TAB'; payload: NavTab }
  | { type: 'SET_MODE'; payload: DaemonMode }
  | { type: 'SET_STATUS'; payload: AgentStatus }
  | { type: 'SET_DRAWER'; payload: boolean }
  | { type: 'UPDATE_AGENT'; payload: Partial<Agent> & { name: Agent['name'] } }
  | { type: 'UPDATE_BIOMETRIC'; payload: Partial<AppState['biometricProfile']> }
  | { type: 'SET_ARMED'; payload: boolean };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_MODE': {
      const next = { ...state, daemonMode: action.payload };
      localStorage.setItem('sentra_mode', action.payload);
      return next;
    }
    case 'SET_STATUS': {
      const next = { ...state, daemonStatus: action.payload };
      localStorage.setItem('sentra_status', action.payload);
      return next;
    }
    case 'SET_DRAWER':
      return { ...state, isDrawerOpen: action.payload };
    case 'UPDATE_AGENT': {
      const agents = state.agents.map((a) =>
        a.name === action.payload.name ? { ...a, ...action.payload } : a
      );
      localStorage.setItem('sentra_agents', JSON.stringify(agents));
      return { ...state, agents };
    }
    case 'UPDATE_BIOMETRIC': {
      const biometricProfile = { ...state.biometricProfile, ...action.payload };
      localStorage.setItem('sentra_biometric', JSON.stringify(biometricProfile));
      return { ...state, biometricProfile };
    }
    case 'SET_ARMED': {
      const armedAt = action.payload ? Date.now() : null;
      localStorage.setItem('sentra_armed', String(action.payload));
      localStorage.setItem('sentra_armed_at', armedAt !== null ? String(armedAt) : 'null');
      return { ...state, armed: action.payload, armedAt };
    }
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  setTab: (tab: NavTab) => void;
  setMode: (mode: DaemonMode) => void;
  setStatus: (status: AgentStatus) => void;
  setDrawer: (open: boolean) => void;
  updateAgent: (update: Partial<Agent> & { name: Agent['name'] }) => void;
  updateBiometric: (update: Partial<AppState['biometricProfile']>) => void;
  setArmed: (armed: boolean) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setTab = useCallback((tab: NavTab) => dispatch({ type: 'SET_TAB', payload: tab }), []);
  const setMode = useCallback((mode: DaemonMode) => dispatch({ type: 'SET_MODE', payload: mode }), []);
  const setStatus = useCallback((status: AgentStatus) => dispatch({ type: 'SET_STATUS', payload: status }), []);
  const setDrawer = useCallback((open: boolean) => dispatch({ type: 'SET_DRAWER', payload: open }), []);
  const updateAgent = useCallback(
    (update: Partial<Agent> & { name: Agent['name'] }) => dispatch({ type: 'UPDATE_AGENT', payload: update }),
    []
  );
  const updateBiometric = useCallback(
    (update: Partial<AppState['biometricProfile']>) => dispatch({ type: 'UPDATE_BIOMETRIC', payload: update }),
    []
  );
  const setArmed = useCallback(
    (armed: boolean) => dispatch({ type: 'SET_ARMED', payload: armed }),
    []
  );

  return (
    <AppContext.Provider value={{ state, setTab, setMode, setStatus, setDrawer, updateAgent, updateBiometric, setArmed }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
