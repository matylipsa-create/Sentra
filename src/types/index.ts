export type AgentName = 'Anchor' | 'Daemon' | 'Observer';
export type DaemonMode = 'ASSIST' | 'STABILIZE' | 'OBSERVE';
export type AgentStatus = 'calm' | 'alert' | 'active' | 'idle';
export type Severity = 'info' | 'warning' | 'critical';
export type NavTab = 'dashboard' | 'regulation' | 'operations' | 'settings';

export interface Agent {
  name: AgentName;
  mode: DaemonMode;
  status: AgentStatus;
  activationLevel: number;
  lastActivity: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: AgentName;
  createdAt: Date;
  voiceSpoken?: boolean;
}

export interface SecurityLog {
  id: string;
  severity: Severity;
  source: string;
  message: string;
  resolved: boolean;
  createdAt: Date;
}

export interface BiometricProfile {
  voiceEnabled: boolean;
  voiceRate: number;
  voicePitch: number;
  voiceVolume: number;
  preferredVoice: string;
  sensorsEnabled: {
    heart_rate: boolean;
    respiration: boolean;
    skin_conductance: boolean;
    motion: boolean;
  };
  stressThreshold: number;
  calmThreshold: number;
}

export interface AppState {
  activeTab: NavTab;
  daemonMode: DaemonMode;
  daemonStatus: AgentStatus;
  agents: Agent[];
  isDrawerOpen: boolean;
  biometricProfile: BiometricProfile;
}
