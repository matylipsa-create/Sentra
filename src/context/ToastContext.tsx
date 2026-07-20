import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'critical';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<ToastVariant, { color: string; icon: React.ElementType; bg: string }> = {
  info:    { color: '#00E5FF', icon: Info,          bg: 'rgba(0, 229, 255, 0.08)' },
  success: { color: '#10b981', icon: CheckCircle,   bg: 'rgba(16, 185, 129, 0.08)' },
  warning: { color: '#FF00A0', icon: AlertTriangle, bg: 'rgba(255, 0, 160, 0.08)' },
  critical: { color: '#ef4444', icon: XCircle,       bg: 'rgba(239, 68, 68, 0.10)' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed top-14 right-2 left-2 sm:left-auto z-50 flex flex-col gap-2 pointer-events-none sm:max-w-sm sm:right-3"
        role="region"
        aria-live="polite"
        aria-label="Notificaciones"
      >
        {toasts.map((t) => {
          const cfg = VARIANT_CONFIG[t.variant];
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className="animate-toast-in pointer-events-auto flex items-start gap-3 p-3 rounded-xl backdrop-blur-xl transition-deep"
              style={{
                background: `linear-gradient(145deg, ${cfg.bg}, rgba(10, 12, 18, 0.95))`,
                border: `1px solid ${cfg.color}40`,
                boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px ${cfg.color}20`,
              }}
            >
              <div
                className="flex-shrink-0 mt-0.5"
                style={{ color: cfg.color, filter: `drop-shadow(0 0 4px ${cfg.color}80)` }}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: cfg.color }}>{t.title}</p>
                {t.message && (
                  <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">{t.message}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar notificación"
                className="flex-shrink-0 text-gray-500 hover:text-white transition-deep"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
