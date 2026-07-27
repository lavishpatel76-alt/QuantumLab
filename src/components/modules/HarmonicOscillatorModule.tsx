import { useState, useMemo } from 'react';
import { solveHarmonicOscillator, HarmonicResult } from '../../physics/modules/harmonicOscillator';
import CanvasPlot from '../charts/CanvasPlot';

const COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#22c55e', '#ef4444', '#f97316', '#ec4899'];

export default function HarmonicOscillatorModule() {
  const [omega, setOmega] = useState(1.0);
  const [mass, setMass] = useState(1.0);
  const [xRange, setXRange] = useState(6.0);
  const [nMax, setNMax] = useState(6);
  const [selectedN, setSelectedN] = useState(0);
  const [plotView, setPlotView] = useState<'wavefunctions' | 'probability' | 'validation'>('wavefunctions');

  const result: HarmonicResult = useMemo(() => solveHarmonicOscillator({
    omega, mass, N: 512, xRange, nMax,
  }), [omega, mass, xRange, nMax]);

  const state = result.states[selectedN];
  const fdm = result.fdmComparison;

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Tabs */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0' }}>
          {(['wavefunctions', 'probability', 'validation'] as const).map(t => (
            <div key={t} className={`module-tab ${plotView === t ? 'active' : ''}`} onClick={() => setPlotView(t)}>
              {t === 'wavefunctions' ? 'Wave Functions' : t === 'probability' ? 'Probability Density' : 'FDM Validation'}
            </div>
          ))}
        </div>

        {/* Main plot */}
        <div className="canvas-panel" style={{ flex: 2, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              {plotView === 'wavefunctions' ? 'Hermite Polynomial Eigenstates' :
               plotView === 'probability' ? 'Probability Densities |ψₙ|²' :
               'FDM vs Analytical Comparison'}
            </span>
            <span className="canvas-panel-badge badge-purple" style={{ marginLeft: 'auto' }}>
              ω = {omega.toFixed(3)} a.u.
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
            {plotView === 'wavefunctions' && (
              <CanvasPlot config={{
                lines: [
                  // Potential well
                  {
                    data: Array.from(result.x).map(xi => 0.5 * mass * omega * omega * xi * xi),
                    color: 'var(--plot-potential)',
                    label: 'V(x)',
                    lineWidth: 1.2,
                    dashed: true,
                  },
                  // All eigenstates offset by energy
                  ...result.states.map((s, i) => ({
                    data: Array.from(s.psi).map(v => v * 0.7 + s.energy),
                    color: COLORS[i % COLORS.length],
                    label: `ψ${i}`,
                    lineWidth: selectedN === i ? 2.5 : 1.2,
                  })),
                ],
                xData: result.x,
                xLabel: 'x [a.u.]',
                yLabel: 'ψₙ(x) + Eₙ [Eₕ]',
                hLines: result.states.map((s, i) => ({ y: s.energy, color: COLORS[i % COLORS.length] + '55', dashed: true })),
              }} />
            )}

            {plotView === 'probability' && (
              <CanvasPlot config={{
                lines: [
                  {
                    data: Array.from(result.x).map(xi => 0.5 * mass * omega * omega * xi * xi / (omega * nMax)),
                    color: 'var(--plot-potential)', label: 'V (norm.)', lineWidth: 1, dashed: true,
                  },
                  ...result.states.map((s, i) => ({
                    data: s.probDensity,
                    color: COLORS[i % COLORS.length],
                    label: `|ψ${i}|²`,
                    lineWidth: selectedN === i ? 2.5 : 1.2,
                  })),
                ],
                xData: result.x,
                xLabel: 'x [a.u.]',
                yLabel: '|ψₙ|² [a.u.⁻¹]',
              }} />
            )}

            {plotView === 'validation' && fdm && (
              <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Comparing analytical Eₙ = ω(n+½) vs FDM eigenvalues (N=512 tridiagonal QL)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>n</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Analytical Eₙ</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>FDM Eₙ</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>|ΔE/E|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(fdm.eigenvalueAnalytical).map((ea, i) => {
                      const ef = fdm.eigenvaluesFDM[i];
                      const relErr = fdm.relativeError[i];
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '5px 10px', color: COLORS[i % COLORS.length] }}>{i}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{ea.toFixed(8)}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{ef.toFixed(8)}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                            <span className={relErr < 1e-6 ? 'good' : relErr < 1e-4 ? 'warn' : 'error'} style={{ fontSize: 11 }}>
                              {relErr.toExponential(3)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* FDM vs Analytical wavefunctions for n=selectedN */}
                {result.states[selectedN]?.psiFDM && (
                  <div style={{ marginTop: 16, height: 140 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Wavefunction comparison n={selectedN}
                    </div>
                    <CanvasPlot config={{
                      lines: [
                        { data: result.states[selectedN].psi, color: 'var(--plot-psi-re)', label: 'Analytical', lineWidth: 2 },
                        { data: result.states[selectedN].psiFDM!, color: 'var(--plot-analytical)', label: 'FDM', lineWidth: 1.5, dashed: true },
                      ],
                      xData: result.x,
                      xLabel: 'x [a.u.]',
                      yLabel: 'ψₙ',
                    }} height={130} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* State observables */}
        {state && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)' }}>
            <div style={{ display: 'flex', gap: 14, padding: '8px 14px', flexWrap: 'wrap' }}>
              {[
                { label: 'n', val: state.n.toString() },
                { label: 'Eₙ = ω(n+½)', val: state.energy.toFixed(6) + ' Eₕ' },
                { label: '⟨x⟩', val: state.xExp.toFixed(4) + ' a.u.' },
                { label: '⟨x²⟩', val: state.x2Exp.toFixed(4) + ' a.u.²' },
                { label: 'Δx = √⟨x²⟩', val: state.deltaX.toFixed(4) + ' a.u.' },
                { label: 'Δp = √⟨p²⟩', val: state.deltaP.toFixed(4) + ' a.u.' },
                { label: 'ΔxΔp', val: state.deltaXDeltaP.toFixed(4) + ' ħ', cls: state.deltaXDeltaP >= 0.499 ? 'good' : 'error' },
                { label: 'Nodes', val: `${state.nodes.length} (= n)` },
              ].map(({ label, val, cls }) => (
                <div key={label} className="obs-item">
                  <div className="obs-label">{label}</div>
                  <div className={`obs-value ${cls ?? ''}`} style={{ fontSize: 12 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Hermite Polynomial Solution</div>
              <div className="math-eq">ψₙ(x) = Nₙ Hₙ(√(mω)x) exp(-mωx²/2)</div>
              <div className="math-eq">Eₙ = ħω(n + ½) = ω(n + ½)  [AU]</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Recurrence: Hₙ(ξ)</div>
              <div className="math-eq">H₀=1, H₁=2ξ</div>
              <div className="math-eq">Hₙ = 2ξHₙ₋₁ - 2(n-1)Hₙ₋₂</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Expectation Values (exact)</div>
              <div className="math-eq">⟨x²⟩ = (n+½)/(mω),  ⟨p²⟩ = mω(n+½)</div>
              <div className="math-eq">ΔxΔp = n+½ [ħ]  (≥ ħ/2)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Oscillator Parameters</div>
          {[
            { lbl: 'ω (frequency)', unit: 'a.u.', val: omega, set: setOmega, step: 0.1, min: 0.01 },
            { lbl: 'Mass m', unit: 'mₑ', val: mass, set: setMass, step: 0.1, min: 0.1 },
            { lbl: 'x range', unit: '±a.u.', val: xRange, set: setXRange, step: 0.5, min: 1 },
            { lbl: 'States (nMax)', unit: '', val: nMax, set: (v: number) => setNMax(Math.min(8, v)), step: 1, min: 1 },
          ].map(({ lbl, unit, val, set, step, min }) => (
            <div key={lbl} className="control-row">
              <label className="control-label">{lbl} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={val} onChange={e => set(parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="control-section">
          <div className="control-section-title">Selected State n</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.states.map((s, i) => (
              <button
                key={i}
                className={`btn ${selectedN === i ? 'btn-primary' : 'btn-ghost'}`}
                style={{ minWidth: 32, padding: '4px 8px', fontSize: 12 }}
                onClick={() => setSelectedN(i)}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Ladder operators info */}
        <div className="control-section">
          <div className="control-section-title">Ladder Operators</div>
          <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', lineHeight: 2 }}>
            <div>â = √(mω/2)[x + ip/(mω)]</div>
            <div>â†= √(mω/2)[x - ip/(mω)]</div>
            <div>â|n⟩ = √n|n-1⟩</div>
            <div>â†|n⟩ = √(n+1)|n+1⟩</div>
            <div style={{ color: 'var(--text-muted)' }}>⟨n|x|n⟩ = 0 ✓</div>
            <div style={{ color: 'var(--text-muted)' }}>⟨n|p|n⟩ = 0 ✓</div>
          </div>
        </div>
      </div>
    </div>
  );
}
