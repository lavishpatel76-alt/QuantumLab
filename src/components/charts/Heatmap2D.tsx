import { useRef, useEffect } from 'react';

interface Heatmap2DProps {
  /** Row-major intensity data [ny × nx] */
  data: Float32Array | Float64Array;
  nx: number;
  ny: number;
  xLabel?: string;
  yLabel?: string;
  colormap?: 'viridis' | 'magma' | 'hot' | 'phase';
  xRange?: [number, number];
  yRange?: [number, number];
  className?: string;
}

/** Viridis-like perceptually uniform colormap */
function colormapViridis(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  // Keypoint interpolation of viridis
  const stops = [
    [68, 1, 84],    // t=0
    [59, 82, 139],  // t=0.25
    [33, 145, 140], // t=0.5
    [94, 201, 98],  // t=0.75
    [253, 231, 37], // t=1
  ];
  const fi = t * 4;
  const i = Math.min(3, Math.floor(fi));
  const frac = fi - i;
  const c0 = stops[i], c1 = stops[i + 1];
  return [
    Math.round(c0[0] + frac * (c1[0] - c0[0])),
    Math.round(c0[1] + frac * (c1[1] - c0[1])),
    Math.round(c0[2] + frac * (c1[2] - c0[2])),
  ];
}

function colormapMagma(t: number): [number, number, number] {
  const stops = [
    [0, 0, 3],
    [87, 15, 109],
    [190, 50, 101],
    [249, 142, 8],
    [252, 253, 191],
  ];
  t = Math.max(0, Math.min(1, t));
  const fi = t * 4;
  const i = Math.min(3, Math.floor(fi));
  const frac = fi - i;
  const c0 = stops[i], c1 = stops[i + 1];
  return [
    Math.round(c0[0] + frac * (c1[0] - c0[0])),
    Math.round(c0[1] + frac * (c1[1] - c0[1])),
    Math.round(c0[2] + frac * (c1[2] - c0[2])),
  ];
}

function applyColormap(t: number, map: string): [number, number, number] {
  if (map === 'magma') return colormapMagma(t);
  return colormapViridis(t);
}

export default function Heatmap2D({
  data, nx, ny, xLabel = 'x', yLabel = 'z',
  colormap = 'viridis', xRange, yRange, className,
}: Heatmap2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<ImageData | null>(null);

  useEffect(() => {
    if (!data.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth || 400;
    const H = canvas.offsetHeight || 300;
    canvas.width = W;
    canvas.height = H;

    // Find min/max
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < minV) minV = data[i];
      if (data[i] > maxV) maxV = data[i];
    }
    const range = maxV - minV || 1;

    // Create pixel buffer
    const imageData = ctx.createImageData(W, H);
    const pixels = imageData.data;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        // Map pixel to data indices
        const dataX = Math.floor((px / W) * nx);
        const dataY = Math.floor((py / H) * ny);
        const idx = Math.min(dataY, ny - 1) * nx + Math.min(dataX, nx - 1);
        const t = (data[idx] - minV) / range;
        const [r, g, b] = applyColormap(t, colormap);
        const pxIdx = (py * W + px) * 4;
        pixels[pxIdx] = r;
        pixels[pxIdx + 1] = g;
        pixels[pxIdx + 2] = b;
        pixels[pxIdx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Axis labels overlay
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    ctx.fillStyle = isDark ? 'rgba(148,163,184,0.8)' : 'rgba(71,85,105,0.8)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, W / 2, H - 4);

    ctx.save();
    ctx.translate(13, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    if (xRange) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(xRange[0].toFixed(2), 16, H - 6);
      ctx.textAlign = 'right';
      ctx.fillText(xRange[1].toFixed(2), W - 4, H - 6);
    }
  }, [data, nx, ny, xLabel, yLabel, colormap, xRange, yRange]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', minHeight: '260px', pointerEvents: 'none' }}
    />
  );
}
