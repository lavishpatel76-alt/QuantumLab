import { useState, useEffect, useRef, useCallback } from 'react';
import { UncertaintySimulation, UncertaintyParams, UncertaintySnapshot } from '../../physics/modules/uncertaintyPrinciple';
import CanvasPlot from '../charts/CanvasPlot';

export default function UncertaintyModule() {
  const [sigma, setSigma] = useState(2.0);
  const [k0, setK0] = useState(1.0);
  const [running, setRunning] = useState(false);
  const [plotView, setPlotView] = useState<'wavefunction' | 'momentum' | 'uncertainty' | 'grid'>('grid');
  const simRef = useRef<UncertaintySimulation | null>(null);
  const rafRef = useRef<number>(0);
  const [snapshot, setSnapshot] = useState<UncertaintySnapshot | null>(null);
  const [history, setHistory] = useState<{ t: number; deltaX: number; deltaP: number; dxdp: number; analytical: number }[]>([]);
  const HISTORY_MAX = 200;

  const buildSim = useCallback(() => {
    const params: UncertaintyParams = {
      sigma, k0, x0: 0, N: 512, xMin: -30, xMax: 30, dt: 0.01, mass: 1,
    };
    simRef.current = new UncertaintySimulation(params);
    setSnapshot(simRef.current.getSnapshot());
    setHistory([]);
  }, [sigma, k0]);

  useEffect(() => { buildSim(); }, [buildSim]);

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      if (!simRef.current) return;
      const snap = simRef.current.advance(5);
      setSnapshot(snap);
      setHistory(h => {
        const entry = { t: snap.t, deltaX: snap.obs.deltaX, deltaP: snap.obs.deltaP, dxdp: snap.obs.deltaXDeltaP, analytical: snap.analyticalSigmaX };
        const next = [...h, entry];
        return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const hbarOver2 = 0.5; // AU

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Module Tabs */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0', flexShrink: 0 }}>
          {(['grid', 'wavefunction', 'momentum', 'uncertainty'] as const).map(t => (
            <div key={t} className={`module-tab ${plotView === t ? 'active' : ''}`} onClick={() => setPlotView(t)}>
              {t === 'grid' ? 'All Plots Grid' : t === 'wavefunction' ? 'Wave Packet ψ(x)' : t === 'momentum' ? 'Momentum Space |ψ̃(k)|²' : 'Uncertainty ΔxΔp(t)'}
            </div>
          ))}
        </div>

        {/* View mode 1: All Plots Grid (2x2 or scrolling stacked) */}
        {plotView === 'grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, flex: 1 }}>
            {/* Wavefunction plot */}
            <div className="canvas-panel" style={{ minHeight: 250 }}>
              <div className="canvas-panel-header">
                <span className="canvas-panel-title">ψ(x,t) — Gaussian Wave Packet</span>
                {snapshot && (
                  <span className="canvas-panel-badge badge-blue" style={{ marginLeft: 'auto' }}>
                    t = {snapshot.t.toFixed(3)} a.u.
                  </span>
                )}
              </div>
              <div style={{ flex: 1, padding: '4px 0' }}>
                {snapshot && (
                  <CanvasPlot config={{
                    lines: [
                      { data: snapshot.psi.toProbabilityDensity(), color: 'var(--plot-prob)', label: '|ψ|²', lineWidth: 2 },
                      { data: snapshot.psi.toReArray(), color: 'var(--plot-psi-re)', label: 'Re(ψ)', lineWidth: 1.2, dashed: true },
                    ],
                    xData: (() => {
                      const N = snapshot.psi.length;
                      const x = new Float64Array(N);
                      for (let i = 0; i < N; i++) x[i] = -30 + i * 60 / N;
                      return x;
                    })(),
                    xLabel: 'x [a.u.]',
                    yLabel: '|ψ|² [a.u.⁻¹]',
                  }} />
                )}
              </div>
            </div>

            {/* Momentum distribution */}
            <div className="canvas-panel" style={{ minHeight: 320 }}>
              <div className="canvas-panel-header">
                <span className="canvas-panel-title">|ψ(x,t)|² — Wave Packet in Position Space</span>
              </div>
              <div style={{ flex: 1, minHeight: 260, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
                {snapshot && (
                  <CanvasPlot config={{
                    lines: [
                      { data: snapshot.momentumDensity, color: 'var(--plot-momentum)', label: '|ψ̃(k)|²', lineWidth: 1.8 },
                    ],
                    xData: snapshot.kGrid,
                    xLabel: 'k [a.u.]',
                    yLabel: '|ψ̃|² [a.u.]',
                  }} />
                )}
              </div>
            </div>

            {/* Δx evolution */}
            <div className="canvas-panel" style={{ minHeight: 320 }}>
              <div className="canvas-panel-header">
                <span className="canvas-panel-title">Δx(t) — Position Uncertainty vs Analytical</span>
              </div>
              <div style={{ flex: 1, minHeight: 260, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
                {history.length > 1 && (
                  <CanvasPlot config={{
                    lines: [
                      { data: history.map(h => h.deltaX), color: 'var(--accent-primary)', label: 'Δx (numerical)', lineWidth: 2 },
                      { data: history.map(h => h.analytical), color: 'var(--accent-red)', label: 'σ(t) analytical', lineWidth: 1.5, dashed: true },
                    ],
                    xData: history.map(h => h.t),
                    xLabel: 't [a.u.]',
                    yLabel: 'Δx [a.u.]',
                  }} />
                )}
              </div>
            </div>

            {/* ΔxΔp plot */}
            <div className="canvas-panel" style={{ minHeight: 320 }}>
              <div className="canvas-panel-header">
                <span className="canvas-panel-title">ΔxΔp(t) — Heisenberg Product (≥ 0.5 ħ)</span>
              </div>
              <div style={{ flex: 1, minHeight: 260, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
                {history.length > 1 && (
                  <CanvasPlot config={{
                    lines: [
                      { data: history.map(h => h.dxdp), color: 'var(--accent-teal)', label: 'ΔxΔp', lineWidth: 2 },
                    ],
                    xData: history.map(h => h.t),
                    xLabel: 't [a.u.]',
                    yLabel: 'ΔxΔp [ħ]',
                    yMin: 0,
                    hLines: [
                      { y: hbarOver2, color: 'var(--accent-amber)', dashed: true },
                    ],
                  }} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* View mode 2: Single Wavefunction */}
        {plotView === 'wavefunction' && snapshot && (
          <div className="canvas-panel" style={{ flex: 2, minHeight: 320 }}>
            <div className="canvas-panel-header">
              <span className="canvas-panel-title">ψ(x,t) — Gaussian Wave Packet Spreading</span>
              <span className="canvas-panel-badge badge-blue" style={{ marginLeft: 'auto' }}>
                t = {snapshot.t.toFixed(3)} a.u.
              </span>
            </div>
            <div style={{ flex: 1, padding: '4px 0' }}>
              <CanvasPlot config={{
                lines: [
                  { data: snapshot.psi.toProbabilityDensity(), color: 'var(--plot-prob)', label: '|ψ|²', lineWidth: 2 },
                  { data: snapshot.psi.toReArray(), color: 'var(--plot-psi-re)', label: 'Re(ψ)', lineWidth: 1.2, dashed: true },
                ],
                xData: (() => {
                  const N = snapshot.psi.length;
                  const x = new Float64Array(N);
                  for (let i = 0; i < N; i++) x[i] = -30 + i * 60 / N;
                  return x;
                })(),
                xLabel: 'x [a.u.]',
                yLabel: '|ψ|² [a.u.⁻¹]',
              }} />
            </div>
          </div>
        )}

        {/* View mode 3: Momentum */}
        {plotView === 'momentum' && snapshot && (
          <div className="canvas-panel" style={{ flex: 2, minHeight: 320 }}>
            <div className="canvas-panel-header">
              <span className="canvas-panel-title">|ψ̃(k)|² — Momentum Distribution (time-invariant)</span>
            </div>
            <div style={{ flex: 1, padding: '4px 0' }}>
              <CanvasPlot config={{
                lines: [
                  { data: snapshot.momentumDensity, color: 'var(--plot-momentum)', label: '|ψ̃(k)|²', lineWidth: 2 },
                ],
                xData: snapshot.kGrid,
                xLabel: 'k [a.u.]',
                yLabel: '|ψ̃|² [a.u.]',
              }} />
            </div>
          </div>
        )}

        {/* View mode 4: Uncertainty */}
        {plotView === 'uncertainty' && (
          <div className="canvas-panel" style={{ flex: 2, minHeight: 320 }}>
            <div className="canvas-panel-header">
              <span className="canvas-panel-title">ΔxΔp(t) — Uncertainty Principle Product</span>
            </div>
            <div style={{ flex: 1, padding: '4px 0' }}>
              {history.length > 1 && (
                <CanvasPlot config={{
                  lines: [
                    { data: history.map(h => h.dxdp), color: 'var(--accent-teal)', label: 'ΔxΔp (numerical)', lineWidth: 2 },
                    { data: history.map(h => h.deltaX), color: 'var(--accent-primary)', label: 'Δx(t)', lineWidth: 1.5, dashed: true },
                  ],
                  xData: history.map(h => h.t),
                  xLabel: 't [a.u.]',
                  yLabel: 'Product [ħ]',
                  yMin: 0,
                  hLines: [
                    { y: hbarOver2, color: 'var(--accent-amber)', label: 'ħ/2 bound' },
                  ],
                }} />
              )}
            </div>
          </div>
        )}

        {/* Current values */}
        {snapshot && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 14, padding: '8px 14px', flexWrap: 'wrap' }}>
              {[
                { label: 'σ₀ (initial)', val: sigma.toFixed(4) + ' a.u.' },
                { label: 'Δx (numerical)', val: snapshot.obs.deltaX.toFixed(6) + ' a.u.' },
                { label: 'Δx (analytical σ(t))', val: snapshot.analyticalSigmaX.toFixed(6) + ' a.u.' },
                { label: 'Δp = 1/(2σ₀)', val: snapshot.analyticalDeltaP.toFixed(6) + ' a.u.', note: 'constant' },
                { label: 'ΔxΔp', val: snapshot.obs.deltaXDeltaP.toFixed(6) + ' ħ', cls: snapshot.obs.deltaXDeltaP >= 0.499 ? 'good' : 'error' },
                { label: 'Heisenberg bound', val: '≥ 0.5 ħ', cls: 'good' },
                { label: '|Δx_num - Δx_ana|', val: Math.abs(snapshot.obs.deltaX - snapshot.analyticalSigmaX).toExponential(3) },
                { label: 'Normalization', val: snapshot.obs.normSquared.toFixed(6), cls: Math.abs(snapshot.obs.normSquared - 1) < 1e-6 ? 'good' : 'warn' },
              ].map(({ label, val, cls, note }) => (
                <div key={label} className="obs-item">
                  <div className="obs-label">{label}</div>
                  <div className={`obs-value ${cls ?? ''}`} style={{ fontSize: 12 }}>{val}</div>
                  {note && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{note}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Heisenberg Uncertainty Principle</div>
              <div className="math-eq">ΔxΔp ≥ ħ/2</div>
              <div className="math-eq" style={{ color: 'var(--text-muted)' }}>Equality holds for minimum-uncertainty Gaussian packets</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Free Particle Spreading (analytical)</div>
              <div className="math-eq">σ(t) = σ₀√(1 + (t/2mσ₀²)²)</div>
              <div className="math-eq">Δp = ħ/(2σ₀) = const (invariant)</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Momentum via FFT</div>
              <div className="math-eq">Δp = √(⟨k²⟩ - ⟨k⟩²) from |ψ̃(k)|² = |FFT(ψ)|²/N</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Simulation</div>
          <div className="btn-row">
            <button className={`btn ${running ? 'btn-danger' : 'btn-primary'}`} onClick={() => setRunning(r => !r)}>
              {running ? '⏸ Pause' : '▶ Run'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setRunning(false); buildSim(); }}>↺ Reset</button>
          </div>
        </div>

        <div className="control-section">
          <div className="control-section-title">Wave Packet</div>
          <div className="control-row">
            <label className="control-label">σ₀ (initial width) <span className="control-unit">a.u.</span></label>
            <input className="control-input" type="number" step="0.1" min={0.2}
              value={sigma} onChange={e => { setSigma(parseFloat(e.target.value)); setRunning(false); }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Δp₀ = 1/(2σ₀) = {(1 / (2 * sigma)).toFixed(4)} a.u.
          </div>
          <div className="control-row" style={{ marginTop: 8 }}>
            <label className="control-label">k₀ (momentum) <span className="control-unit">a.u.</span></label>
            <input className="control-input" type="number" step="0.5"
              value={k0} onChange={e => { setK0(parseFloat(e.target.value)); setRunning(false); }} />
          </div>
        </div>

        <div className="control-section">
          <div className="control-section-title">Explore</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div>• Narrow σ₀ → large Δp</div>
            <div>• Wide σ₀ → small Δp</div>
            <div>• ΔxΔp always ≥ 0.5 ħ</div>
            <div>• Δp is constant (free)</div>
            <div>• Δx grows as σ(t)</div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Minimum uncertainty', sigma: 2, k0: 0 },
              { label: 'Narrow packet', sigma: 0.5, k0: 2 },
              { label: 'Wide packet', sigma: 5, k0: 1 },
            ].map(p => (
              <button key={p.label} className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 11 }}
                onClick={() => { setSigma(p.sigma); setK0(p.k0); setRunning(false); }}>
                {p.label} (σ={p.sigma})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
