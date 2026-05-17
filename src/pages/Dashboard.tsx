import { useApp } from '../context/AppContext';
import TacticalDashboard from '../components/TacticalDashboard';

export default function Dashboard() {
  const { state } = useApp();

  return (
    <div className="flex flex-col h-full gap-0">
      <TacticalDashboard />
    </div>
  );
}
