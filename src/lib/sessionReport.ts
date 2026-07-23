import type { DaemonMode } from '../types';
import { MODE_COLORS } from '../hooks/useSessionMetrics';

export interface SessionReportData {
  product: string;
  version: string;
  session_id: string;
  session_number: number;
  generated_at: string;
  duration_sec: number;
  current_mode: DaemonMode;
  metrics: Record<DaemonMode, number>;
  total_events: number;
  lifetime_metrics: Record<DaemonMode, number>;
  lifetime_total: number;
  history: Array<{ time: string; mode: DaemonMode; label: string; event: string; color: string }>;
}

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function fmtDur(s: number): string {
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function exportJSON(data: SessionReportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `sentinel-report-${data.session_id}.json`);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function drawKV(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, mono: string, valueColor?: string): void {
  ctx.fillStyle = '#4a5266';
  ctx.font = `500 16px ${mono}`;
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y);
  ctx.fillStyle = valueColor || '#dfe4ee';
  ctx.font = `700 26px ${mono}`;
  ctx.fillText(value, x, y + 26);
}

function sectionLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, mono: string): void {
  ctx.fillStyle = '#4a5266';
  ctx.font = `700 18px ${mono}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

export async function exportPNG(data: SessionReportData, returnBlob = false): Promise<{ blob: Blob; data: SessionReportData }> {
  try {
    await Promise.all([
      document.fonts.load('700 40px "JetBrains Mono"'),
      document.fonts.load('700 20px "JetBrains Mono"'),
      document.fonts.load('500 22px "Space Grotesk"'),
    ]);
  } catch { /* fallback fonts */ }

  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const mono = '"JetBrains Mono", ui-monospace, Menlo, monospace';
  const sans = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#06080d');
  grad.addColorStop(1, '#0a0e18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const rad = ctx.createRadialGradient(W / 2, 300, 50, W / 2, 300, 700);
  rad.addColorStop(0, 'rgba(0, 229, 255, 0.08)');
  rad.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, 700);

  const PAD = 64;

  ctx.save();
  ctx.translate(PAD, 100);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, 4); ctx.lineTo(4, 12); ctx.lineTo(4, 30);
  ctx.quadraticCurveTo(4, 52, 24, 60);
  ctx.quadraticCurveTo(44, 52, 44, 30);
  ctx.lineTo(44, 12);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16, 30); ctx.lineTo(22, 36); ctx.lineTo(34, 22);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#dfe4ee';
  ctx.font = `700 56px ${mono}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('SENTINEL', PAD + 72, 132);

  ctx.fillStyle = '#7a8399';
  ctx.font = `500 20px ${sans}`;
  ctx.fillText('Soberanía Sobre tu Seguridad', PAD + 72, 172);

  ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
  roundRect(ctx, W - PAD - 220, 108, 220, 44, 22);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#00e5ff';
  ctx.font = `700 18px ${mono}`;
  ctx.textAlign = 'center';
  ctx.fillText('SESSION REPORT', W - PAD - 110, 132);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#1e2536';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 220); ctx.lineTo(W - PAD, 220);
  ctx.stroke();

  const metaY = 264;
  drawKV(ctx, PAD,       metaY,         'SESSION ID',     data.session_id, mono);
  drawKV(ctx, PAD + 340, metaY,         'GENERADO',       new Date(data.generated_at).toLocaleString(), mono);
  drawKV(ctx, PAD,       metaY + 90,    'DURACIÓN',       fmtDur(data.duration_sec), mono);
  drawKV(ctx, PAD + 340, metaY + 90,    'MODO ACTUAL',    data.current_mode, mono, MODE_COLORS[data.current_mode]);
  drawKV(ctx, PAD + 680, metaY + 90,    'EVENTOS TOTALES', String(data.total_events), mono);

  ctx.fillStyle = '#dfe4ee';
  ctx.font = `700 120px ${mono}`;
  ctx.textAlign = 'right';
  ctx.fillText(String(data.total_events), W - PAD, 316);
  ctx.textAlign = 'left';

  sectionLabel(ctx, PAD, 460, `// MÉTRICAS · SESIÓN #${data.session_number} (histórico total: ${data.lifetime_total})`, mono);

  const modeOrder: DaemonMode[] = ['ASSIST', 'STABILIZE', 'SOFT_WARN', 'OBSERVE'];
  const maxCount = Math.max(1, ...Object.values(data.metrics));
  let by = 500;
  const barX = PAD + 220;
  const barW = W - PAD - barX - 130;
  modeOrder.forEach((mode) => {
    const count = data.metrics[mode] || 0;
    const lifeC = data.lifetime_metrics[mode] || 0;
    const color = MODE_COLORS[mode];
    const pct = count / maxCount;

    ctx.fillStyle = color;
    ctx.font = `700 24px ${mono}`;
    ctx.fillText(mode, PAD, by + 22);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, barX, by + 4, barW, 28, 14); ctx.fill();

    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, color);
    fillGrad.addColorStop(1, hexAlpha(color, 0.6));
    ctx.fillStyle = fillGrad;
    const fillW = Math.max(pct * barW, count ? 12 : 0);
    roundRect(ctx, barX, by + 4, fillW, 28, 14); ctx.fill();

    ctx.fillStyle = '#dfe4ee';
    ctx.font = `700 28px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(count), W - PAD - 60, by + 26);

    ctx.fillStyle = hexAlpha(color, 0.75);
    ctx.font = `500 18px ${mono}`;
    ctx.fillText(`Σ${lifeC}`, W - PAD, by + 26);
    ctx.textAlign = 'left';

    by += 72;
  });

  const evY = by + 30;
  sectionLabel(ctx, PAD, evY, '// ÚLTIMOS EVENTOS', mono);

  const recent = data.history.slice(-8).reverse();
  let ey = evY + 44;
  if (recent.length === 0) {
    ctx.fillStyle = '#4a5266';
    ctx.font = `italic 20px ${mono}`;
    ctx.fillText('Sin eventos registrados en esta sesión', PAD, ey + 12);
  } else {
    recent.forEach((e) => {
      ctx.fillStyle = e.color;
      roundRect(ctx, PAD, ey - 2, 4, 32, 2); ctx.fill();

      ctx.fillStyle = '#4a5266';
      ctx.font = `500 20px ${mono}`;
      ctx.fillText(`[${e.time}]`, PAD + 18, ey + 20);

      ctx.fillStyle = e.color;
      ctx.font = `700 20px ${mono}`;
      ctx.fillText(e.mode, PAD + 160, ey + 20);

      ctx.fillStyle = '#dfe4ee';
      ctx.font = `500 20px ${sans}`;
      ctx.fillText(e.label, PAD + 330, ey + 20);

      ey += 42;
    });
  }

  const foot = H - 90;
  ctx.strokeStyle = '#1e2536';
  ctx.beginPath();
  ctx.moveTo(PAD, foot - 20); ctx.lineTo(W - PAD, foot - 20);
  ctx.stroke();

  ctx.fillStyle = '#4a5266';
  ctx.font = `500 18px ${mono}`;
  ctx.fillText('SENTINEL · Sentra integrated · sesión local', PAD, foot + 12);

  ctx.fillStyle = '#7a8399';
  ctx.textAlign = 'right';
  ctx.fillText(data.session_id, W - PAD, foot + 12);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
      if (!returnBlob) downloadBlob(blob, `sentinel-report-${data.session_id}.png`);
      resolve({ blob, data });
    }, 'image/png');
  });
}

export async function shareReport(data: SessionReportData): Promise<{ blob: Blob; shared: boolean }> {
  const { blob, data: reportData } = await exportPNG(data, true);
  const filename = `sentinel-report-${reportData.session_id}.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  const text = `Sentinel · Sesión ${reportData.session_id} · ${reportData.total_events} eventos en ${fmtDur(reportData.duration_sec)} (histórico ${reportData.lifetime_total})`;

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Reporte Sentinel', text });
      return { blob, shared: true };
    } catch (e) {
      if (e && (e as Error).name === 'AbortError') return { blob, shared: false };
    }
  }
  downloadBlob(blob, filename);
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  return { blob, shared: false };
}
