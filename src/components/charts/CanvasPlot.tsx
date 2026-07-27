import { useRef, useEffect, useCallback } from 'react';

interface PlotLine {
  data: Float64Array | number[];
  color: string;
  label: string;
  lineWidth?: number;
  dashed?: boolean;
}

interface PlotConfig {
  lines: PlotLine[];
  xData: Float64Array | number[];
  xLabel: string;
  yLabel: string;
  title?: string;
  yMin?: number;
  yMax?: number;
  /** Vertical lines (e.g. energy levels) */
  vLines?: { x: number; color: string; label?: string }[];
  /** Horizontal lines (e.g. zero baseline) */
  hLines?: { y: number; color: string; dashed?: boolean; label?: string }[];
  /** Filled regions */
  fillRegions?: { xStart: number; xEnd: number; color: string; opacity: number }[];
}

interface CanvasPlotProps {
  config: PlotConfig;
  className?: string;
  height?: number;
}

const MARGIN = { top: 22, right: 20, bottom: 48, left: 64 };

function formatNumber(n: number): string {
  if (Math.abs(n) === 0) return '0';
  if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && Math.abs(n) > 0)) {
    return n.toExponential(2);
  }
  return n.toPrecision(3);
}

export default function CanvasPlot({ config, className, height }: CanvasPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth || 400;
    const H = height || Math.max(280, canvas.offsetHeight);

    // High DPI crisp rendering
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#cbd5e1' : '#1e293b';       // High contrast slate
    const axisTitleColor = isDark ? '#94a3b8' : '#334155';  // Crisp axis title
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.45)' : 'rgba(203, 213, 225, 0.6)';
    const zeroLineColor = isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.8)';
    const frameColor = isDark ? 'rgba(71, 85, 105, 0.9)' : 'rgba(100, 116, 139, 0.9)';
    const bgColor = isDark ? '#0b0f17' : '#ffffff';

    // Clear background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const plotW = W - MARGIN.left - MARGIN.right;
    const plotH = H - MARGIN.top - MARGIN.bottom;

    if (plotW < 20 || plotH < 20) { ctx.restore(); return; }

    const { lines, xData, xLabel, yLabel, vLines, hLines, fillRegions } = config;

    const xMin = xData[0] as number;
    const xMax = xData[xData.length - 1] as number;
    const xRange = xMax - xMin || 1;

    // Determine Y range
    let yMin = config.yMin ?? Infinity;
    let yMax = config.yMax ?? -Infinity;

    if (yMin === Infinity || yMax === -Infinity) {
      for (const line of lines) {
        for (let i = 0; i < line.data.length; i++) {
          const v = line.data[i] as number;
          if (!isFinite(v)) continue;
          if (yMin === Infinity || v < yMin) yMin = v;
          if (yMax === -Infinity || v > yMax) yMax = v;
        }
      }
      const pad = (yMax - yMin) * 0.08 || 0.1;
      yMin = (config.yMin !== undefined) ? config.yMin : yMin - pad;
      yMax = (config.yMax !== undefined) ? config.yMax : yMax + pad;
    }
    const yRange = yMax - yMin || 1;

    // Coordinate transforms
    const toCanvasX = (x: number) => MARGIN.left + ((x - xMin) / xRange) * plotW;
    const toCanvasY = (y: number) => MARGIN.top + ((yMax - y) / yRange) * plotH;

    // Clip plot region for data lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN.left, MARGIN.top, plotW, plotH);
    ctx.clip();

    // Fill regions
    if (fillRegions) {
      for (const region of fillRegions) {
        ctx.fillStyle = region.color;
        ctx.globalAlpha = region.opacity;
        const rx1 = toCanvasX(region.xStart);
        const rx2 = toCanvasX(region.xEnd);
        ctx.fillRect(rx1, MARGIN.top, rx2 - rx1, plotH);
        ctx.globalAlpha = 1;
      }
    }

    // Background Grid
    const nGridY = 5, nGridX = 6;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= nGridY; i++) {
      const y = MARGIN.top + (i / nGridY) * plotH;
      ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(MARGIN.left + plotW, y); ctx.stroke();
    }
    for (let i = 0; i <= nGridX; i++) {
      const x = MARGIN.left + (i / nGridX) * plotW;
      ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, MARGIN.top + plotH); ctx.stroke();
    }

    // Draw primary zero axes (x=0 and y=0 crosshairs) if inside plot bounds
    if (yMin <= 0 && yMax >= 0) {
      const y0 = toCanvasY(0);
      ctx.strokeStyle = zeroLineColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(MARGIN.left, y0); ctx.lineTo(MARGIN.left + plotW, y0); ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const x0 = toCanvasX(0);
      ctx.strokeStyle = zeroLineColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x0, MARGIN.top); ctx.lineTo(x0, MARGIN.top + plotH); ctx.stroke();
    }

    // Horizontal reference lines
    if (hLines) {
      for (const hl of hLines) {
        const y = toCanvasY(hl.y);
        if (y < MARGIN.top || y > MARGIN.top + plotH) continue;
        ctx.strokeStyle = hl.color;
        ctx.lineWidth = 1.0;
        if (hl.dashed) ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(MARGIN.left + plotW, y); ctx.stroke();
        ctx.setLineDash([]);
        if (hl.label) {
          ctx.fillStyle = hl.color;
          ctx.font = `9px JetBrains Mono, monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(hl.label, MARGIN.left + plotW - 4, y - 4);
        }
      }
    }

    // Vertical reference lines
    if (vLines) {
      for (const vl of vLines) {
        const x = toCanvasX(vl.x);
        if (x < MARGIN.left || x > MARGIN.left + plotW) continue;
        ctx.strokeStyle = vl.color;
        ctx.lineWidth = 1.0;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, MARGIN.top + plotH); ctx.stroke();
        ctx.setLineDash([]);
        if (vl.label) {
          ctx.fillStyle = vl.color;
          ctx.font = `9px JetBrains Mono, monospace`;
          ctx.fillText(vl.label, x + 3, MARGIN.top + 12);
        }
      }
    }

    // Data curves
    for (const line of lines) {
      if (!line.data.length) continue;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.lineWidth ?? 1.8;
      if (line.dashed) ctx.setLineDash([5, 3]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      let started = false;
      const N = Math.min(line.data.length, xData.length);

      for (let i = 0; i < N; i++) {
        const x = toCanvasX(xData[i] as number);
        const y = toCanvasY(line.data[i] as number);

        if (!isFinite(y)) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Draw Main Outer Plot Frame
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(MARGIN.left, MARGIN.top, plotW, plotH);

    // Draw Axis Tick Notches
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 1.2;

    // Y Ticks (left border)
    for (let i = 0; i <= nGridY; i++) {
      const y = MARGIN.top + (i / nGridY) * plotH;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(MARGIN.left - 5, y);
      ctx.stroke();
    }

    // X Ticks (bottom border)
    for (let i = 0; i <= nGridX; i++) {
      const x = MARGIN.left + (i / nGridX) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top + plotH);
      ctx.lineTo(x, MARGIN.top + plotH + 5);
      ctx.stroke();
    }

    // Y-axis numerical tick values
    ctx.fillStyle = textColor;
    ctx.font = `10.5px JetBrains Mono, monospace`;
    ctx.textAlign = 'right';
    for (let i = 0; i <= nGridY; i++) {
      const val = yMin + (1 - i / nGridY) * yRange;
      const y = MARGIN.top + (i / nGridY) * plotH;
      ctx.fillText(formatNumber(val), MARGIN.left - 8, y + 3.5);
    }

    // X-axis numerical tick values
    ctx.textAlign = 'center';
    for (let i = 0; i <= nGridX; i++) {
      const val = xMin + (i / nGridX) * xRange;
      const x = MARGIN.left + (i / nGridX) * plotW;
      ctx.fillText(formatNumber(val), x, MARGIN.top + plotH + 18);
    }

    // X Axis Title
    ctx.fillStyle = axisTitleColor;
    ctx.font = `600 11px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, MARGIN.left + plotW / 2, H - 8);

    // Y Axis Title
    ctx.save();
    ctx.translate(14, MARGIN.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = axisTitleColor;
    ctx.font = `600 11px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Chart Title (top right)
    if (config.title) {
      ctx.fillStyle = axisTitleColor;
      ctx.font = `600 11px Inter, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(config.title, W - MARGIN.right, MARGIN.top - 6);
    }

    ctx.restore();
  }, [config, height]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current && canvasRef.current.parentElement) {
      ro.observe(canvasRef.current.parentElement);
    }
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: height ? `${height}px` : '100%',
        minHeight: height ? `${height}px` : '280px',
        pointerEvents: 'none',
      }}
    />
  );
}
