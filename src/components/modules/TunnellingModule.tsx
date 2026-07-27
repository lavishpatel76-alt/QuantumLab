import { useState, useEffect, useCallback } from 'react';
import { computeTunnelling, BarrierRegion, TunnellingResult } from '../../physics/modules/../solvers/transferMatrix';
import CanvasPlot from '../charts/CanvasPlot';

type BarrierType = 'step' | 'single' | 'double' | 'gaussian' | 'multi';

const DEFAULT_E = 5.0;
const DEFAULT_V0 = 8.0;
const DEFAULT_WIDTH = 2.0;

export default function TunnellingModule() {
  const [E, setE] = useState(DEFAULT_E);
  const [V0, setV0] = useState(DEFAULT_V0);
  const [barrierWidth, setBarrierWidth] = useState(DEFAULT_WIDTH);
  const [barrierType, setBarrierType] = useState<BarrierType>('single');
  const [mass, setMass] = useState(1.0);
  const [result, setResult] = useState<TunnellingResult | null>(null);
  const [plotView, setPlotView] = useState<'wavefunction' | 'probability' | 'current'>('wavefunction');
  const [mathTab, setMathTab] = useState<'equations' | 'numerics' | 'result'>('result');

  const buildBarriers = useCallback((): BarrierRegion[] => {
    const center = 0;
    switch (barrierType) {
      case 'step':
        return [{ xStart: center, xEnd: center + 20, V: V0 }];
      case 'single':
        return [{ xStart: center - barrierWidth / 2, xEnd: center + barrierWidth / 2, V: V0 }];
      case 'double': {
        const sep = barrierWidth;
        return [
          { xStart: -sep - barrierWidth / 2, xEnd: -sep + barrierWidth / 2, V: V0 },
          { xStart: sep - barrierWidth / 2,  xEnd: sep + barrierWidth / 2,  V: V0 },
        ];
      }
      case 'gaussian':
        // Approximate Gaussian with many thin slices
        return Array.from({ length: 20 }, (_, i) => {
          const x = -3 * barrierWidth + i * 0.3 * barrierWidth;
          const v = V0 * Math.exp(-0.5 * (x / barrierWidth) * (x / barrierWidth));
          return { xStart: x, xEnd: x + 0.3 * barrierWidth, V: v };
        });
      case 'multi':
        return Array.from({ length: 3 }, (_, i) => ({
          xStart: (i - 1) * 4 - barrierWidth / 2,
          xEnd: (i - 1) * 4 + barrierWidth / 2,
          V: V0 * (1 - i * 0.1),
        }));
    }
  }, [barrierType, V0, barrierWidth]);

  useEffect(() => {
    const barriers = buildBarriers();
    const res = computeTunnelling(barriers, E, mass, 1024);
    setResult(res);
  }, [E, V0, barrierWidth, barrierType, mass, buildBarriers]);

  // Build potential profile for display
  const potProfile = result ? (() => {
    const barriers = buildBarriers();
    const V = new Float64Array(result.x.length);
    for (let i = 0; i < result.x.length; i++) {
      V[i] = 0;
      for (const b of barriers) {
        if (result.x[i] >= b.xStart && result.x[i] <= b.xEnd) { V[i] = b.V; break; }
      }
    }
    return V;
  })() : null;

  const T = result?.T ?? 0;
  const R = result?.R ?? 0;
  const conservErr = result?.conservationError ?? 0;

  // Analytical T for rectangular barrier: T = [1 + V₀²sinh²(κa)/(4E(V₀-E))]⁻¹
  const analyticalT = (() => {
    if (barrierType !== 'single') return null;
    if (E >= V0) {
      // Above-barrier: T = [1 + sin²(ka)/(4(E/V0)(1-E/V0)·(V0/E)²·...)]⁻¹ — use full formula
      const k1 = Math.sqrt(2 * mass * E);
      const k2 = Math.sqrt(2 * mass * (E - V0));
      const a = barrierWidth;
      const denom = 1 + Math.pow((k2 * k2 - k1 * k1) * Math.sin(k2 * a) / (2 * k1 * k2), 2);
      return 1 / denom;
    } else {
      const kappa = Math.sqrt(2 * mass * (V0 - E));
      const a = barrierWidth;
      const sinh2 = Math.pow(Math.sinh(kappa * a), 2);
      return 1 / (1 + V0 * V0 * sinh2 / (4 * E * (V0 - E)));
    }
  })();

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Tab selector */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0' }}>
          {(['wavefunction', 'probability', 'current'] as const).map(t => (
            <div key={t} className={`module-tab ${plotView === t ? 'active' : ''}`} onClick={() => setPlotView(t)}>
              {t === 'wavefunction' ? 'Wave Function' : t === 'probability' ? 'Probability Density' : 'Probability Current'}
            </div>
          ))}
        </div>

        {/* Main plot */}
        <div className="canvas-panel" style={{ flex: 2, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">Quantum Tunnelling — {barrierType.charAt(0).toUpperCase() + barrierType.slice(1)} Barrier</span>
            <span className="canvas-panel-badge badge-blue" style={{ marginLeft: 'auto' }}>E = {E.toFixed(3)} Eₕ</span>
            <span className="canvas-panel-badge badge-amber" style={{ marginLeft: 6 }}>V₀ = {V0.toFixed(3)} Eₕ</span>
          </div>
          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
            {result && potProfile && (
              <CanvasPlot config={{
                lines: plotView === 'wavefunction' ? [
                  { data: result.psiRe, color: 'var(--plot-psi-re)', label: 'Re(ψ)', lineWidth: 1.5 },
                  { data: result.psiIm, color: 'var(--plot-psi-im)', label: 'Im(ψ)', lineWidth: 1.5 },
                  { data: Array.from(potProfile).map(v => v / (V0 || 1) * 0.8), color: 'var(--plot-potential)', label: 'V (norm.)', lineWidth: 1, dashed: true },
                ] : plotView === 'probability' ? [
                  { data: result.probDensity, color: 'var(--plot-prob)', label: '|ψ|²', lineWidth: 2 },
                  { data: Array.from(potProfile).map(v => v / (V0 || 1) * 0.8), color: 'var(--plot-potential)', label: 'V (norm.)', lineWidth: 1, dashed: true },
                ] : [
                  { data: result.probCurrentX, color: 'var(--plot-momentum)', label: 'J(x)', lineWidth: 1.5 },
                ],
                xData: result.x,
                xLabel: 'x [a.u.]',
                yLabel: plotView === 'current' ? 'J(x) [a.u.]' : 'ψ [a.u.⁻¹/²]',
                hLines: [{ y: 0, color: 'var(--border-default)', dashed: false }],
              }} />
            )}
          </div>
        </div>

        {/* Transmission / Reflection results */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)', padding: '10px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
            <div className="obs-item">
              <div className="obs-label">Transmission T</div>
              <div className="obs-value" style={{ fontSize: 20, color: 'var(--accent-teal)' }}>{T.toFixed(6)}</div>
            </div>
            <div className="obs-item">
              <div className="obs-label">Reflection R</div>
              <div className="obs-value" style={{ fontSize: 20, color: 'var(--plot-psi-im)' }}>{R.toFixed(6)}</div>
            </div>
            <div className="obs-item">
              <div className="obs-label">T + R</div>
              <div className={`obs-value ${conservErr < 1e-8 ? 'good' : 'error'}`}>
                {(T + R).toFixed(10)}
              </div>
            </div>
            <div className="obs-item">
              <div className="obs-label">|T+R - 1|</div>
              <div className={`obs-value ${conservErr < 1e-8 ? 'good' : 'warn'}`}>
                {conservErr.toExponential(3)}
              </div>
            </div>
            {analyticalT !== null && (<>
              <div className="obs-item">
                <div className="obs-label">T (analytical)</div>
                <div className="obs-value">{analyticalT.toFixed(6)}</div>
              </div>
              <div className="obs-item">
                <div className="obs-label">|T_num - T_ana|</div>
                <div className={`obs-value ${Math.abs(T - analyticalT) < 0.001 ? 'good' : 'warn'}`}>
                  {Math.abs(T - analyticalT).toExponential(3)}
                </div>
              </div>
            </>)}
          </div>
        </div>

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-tabs">
            {(['equations', 'numerics', 'result'] as const).map(t => (
              <div key={t} className={`math-tab ${mathTab === t ? 'active' : ''}`} onClick={() => setMathTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>
          <div className="math-panel-content">
            {mathTab === 'equations' && (<>
              <div className="math-block">
                <div className="math-block-label">Stationary Schrödinger Equation</div>
                <div className="math-eq">-ħ²/(2m) d²ψ/dx² + V(x)ψ = Eψ</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Solutions per Region</div>
                <div className="math-eq">E &gt; V: ψ = Ae^(ikx) + Be^(-ikx),  k = √(2m(E-V))</div>
                <div className="math-eq">E &lt; V: ψ = Ce^(κx) + De^(-κx),  κ = √(2m(V-E))</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Probability Current</div>
                <div className="math-eq">J = (ħ/m) Im(ψ* dψ/dx)</div>
              </div>
            </>)}
            {mathTab === 'numerics' && (<>
              <div className="math-block">
                <div className="math-block-label">Method: Transfer Matrix</div>
                <div className="math-eq">M_total = M_N · ... · M_2 · M_1</div>
                <div className="math-eq">T = 4k_L·k_R / |k_R·M₁₁ + k_L·M₂₂ + i(k_L·k_R·M₁₂ - M₂₁)|²</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Conservation Check</div>
                <div className="math-eq">T + R = 1 (exact by Wronskian conservation)</div>
                <div className={`math-eq ${conservErr < 1e-8 ? '' : 'warn'}`}>
                  Numerical error: {conservErr.toExponential(3)}
                </div>
              </div>
            </>)}
            {mathTab === 'result' && (<>
              <div className="math-block">
                <div className="math-block-label">Analytical T (rectangular barrier)</div>
                <div className="math-eq">
                  {E < V0
                    ? 'T = [1 + V₀²sinh²(κa)/(4E(V₀-E))]⁻¹'
                    : 'T = [1 + (k₂²-k₁²)²sin²(k₂a)/(4k₁²k₂²)]⁻¹'}
                </div>
                {analyticalT !== null && (
                  <div className="math-eq" style={{ color: 'var(--accent-green)' }}>
                    = {analyticalT.toFixed(6)}
                  </div>
                )}
              </div>
              <div className="math-block">
                <div className="math-block-label">Regime</div>
                <div className="math-eq" style={{ color: E < V0 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                  {E < V0 ? '⚡ Tunnelling (E < V₀)' : '→ Above-barrier transmission (E > V₀)'}
                </div>
                <div className="math-eq" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                  κa = {E < V0 ? (Math.sqrt(2 * mass * (V0 - E)) * barrierWidth).toFixed(3) : 'N/A'} a.u.
                </div>
              </div>
            </>)}
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Barrier Type</div>
          <select className="control-select" value={barrierType}
            onChange={e => setBarrierType(e.target.value as BarrierType)}>
            <option value="step">Step Potential</option>
            <option value="single">Single Barrier</option>
            <option value="double">Double Barrier</option>
            <option value="gaussian">Gaussian Barrier</option>
            <option value="multi">Multi Barrier (×3)</option>
          </select>
        </div>

        <div className="control-section">
          <div className="control-section-title">Energy & Potential</div>
          {[
            { label: 'E (particle energy)', unit: 'Eₕ', value: E, set: setE, step: 0.1, min: 0.01 },
            { label: 'V₀ (barrier height)', unit: 'Eₕ', value: V0, set: setV0, step: 0.5, min: 0 },
            { label: 'Barrier width a', unit: 'a.u.', value: barrierWidth, set: setBarrierWidth, step: 0.1, min: 0.1 },
            { label: 'Mass m', unit: 'mₑ', value: mass, set: setMass, step: 0.1, min: 0.1 },
          ].map(({ label, unit, value, set, step, min }) => (
            <div key={label} className="control-row">
              <label className="control-label">{label} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={value} onChange={e => set(parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        {/* T vs E scan */}
        <div className="control-section">
          <div className="control-section-title">T vs E Scan</div>
          <div style={{ height: 120, background: 'var(--bg-input)', borderRadius: 'var(--control-radius)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <CanvasPlot config={{
              lines: [{
                data: (() => {
                  const out = new Float64Array(100);
                  for (let i = 0; i < 100; i++) {
                    const Ei = 0.1 + i * (V0 * 2) / 100;
                    const barriers = buildBarriers();
                    out[i] = computeTunnelling(barriers, Ei, mass, 64).T;
                  }
                  return out;
                })(),
                color: 'var(--plot-prob)',
                label: 'T(E)',
                lineWidth: 1.5,
              }],
              xData: (() => {
                const xs = new Float64Array(100);
                for (let i = 0; i < 100; i++) xs[i] = 0.1 + i * (V0 * 2) / 100;
                return xs;
              })(),
              xLabel: 'E [Eₕ]',
              yLabel: 'T',
              yMin: 0, yMax: 1,
              vLines: [{ x: E, color: 'var(--accent-amber)', label: 'E' }, { x: V0, color: 'var(--accent-red)', label: 'V₀' }],
            }} height={110} />
          </div>
        </div>

        <div className="status-row">
          <span className={`validation-indicator ${conservErr < 1e-8 ? 'ind-ok' : 'ind-warn'}`} />
          <span className="status-label">T+R error:</span>
          <span className="status-value">{conservErr.toExponential(2)}</span>
        </div>
      </div>
    </div>
  );
}
