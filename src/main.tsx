import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

try {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('Elemento #root no encontrado en el DOM');

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (e) {
  // Last-resort fallback: write the error directly to the body so the
  // user sees SOMETHING instead of a black screen.
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[SENTRA] createRoot failed:', msg);

  document.body.innerHTML = [
    '<div style="background:#000;color:#fff;font-family:monospace;padding:24px;min-height:100vh;box-sizing:border-box;">',
    '<h2 style="color:#ef4444;margin:0 0 12px;">SENTRA — Error crítico de inicio</h2>',
    '<p style="color:#ccc;font-size:14px;word-break:break-word;">' + msg + '</p>',
    '<p style="color:#888;font-size:12px;margin-top:16px;">Recargá la página o agregá ?debug=true a la URL para diagnóstico.</p>',
    '</div>',
  ].join('');
}
