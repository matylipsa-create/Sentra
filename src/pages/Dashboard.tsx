import SentraHUD from '../components/SentraHUD';
import SentinelIntegration from '../components/SentinelIntegration';

export default function Dashboard() {
  console.log('Dashboard montado');
  return (
    <>
      <SentraHUD />
      <SentinelIntegration />
    </>
  );
}
