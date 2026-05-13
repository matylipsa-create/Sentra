import { LayoutDashboard, MessageCircle, Shield, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { NavTab } from '../types';

const TABS: { id: NavTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { id: 'regulation', label: 'Regulación', icon: MessageCircle },
  { id: 'operations', label: 'Operaciones', icon: Shield },
  { id: 'settings', label: 'Config', icon: Settings },
];

export default function BottomNav() {
  const { state, setTab } = useApp();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{ background: 'rgba(10, 14, 26, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = state.activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 relative"
            >
              {/* Active indicator line */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-400"
                  style={{ boxShadow: '0 0 6px #1a73e8' }}
                />
              )}
              <Icon
                size={22}
                className="transition-all duration-200"
                style={{ color: isActive ? '#1a73e8' : 'rgba(156,163,175,0.6)' }}
              />
              <span
                className="text-xs font-medium transition-all duration-200"
                style={{ color: isActive ? '#1a73e8' : 'rgba(156,163,175,0.5)', fontSize: '10px' }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area spacer */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  );
}
