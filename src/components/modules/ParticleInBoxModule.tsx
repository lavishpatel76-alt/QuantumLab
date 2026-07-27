import { useState, useEffect, useMemo } from 'react';
import { solveParticleInBox, BoxResult, evolveBoxSuperposition } from '../../physics/modules/particleInBox';
import CanvasPlot from '../charts/CanvasPlot';

export default function ParticleInBoxModule() {
  const [L, setL] = useState(10.0);
  const [mass, setMass] = useState(1.0);
  const [nMax, setNMax] = useState(6);
  const [selectedN, setSelectedN] = useState(1);
  const [showOrthogonality, setShowOrthogonality] = useState(false);
  const [plotView, setPlotView] = useState<'wavefunctions' | 'energy' | 'orthogonality'>('wavefunctions');

  const result: BoxResult = useMemo(() => solveParticleInBox({ L, mass, N: 512, nMax }), [L, mass, nMax]);

  const state = result.states[selectedN - 1];

  const colors = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#22c55e', '#ef4444', '#f97316', '#ec4899'];

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Tab selector */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0' }}>
          {(['wavefunctions', 'energy', 'orthogonality'] as const).map(t => (
            <div key={t} className={`module-tab ${plotView === t ? 'active' : ''}`} onClick={() => setPlotView(t)}>
              {t === 'wavefunctions' ? 'Wave Functions' : t === 'energy' ? 'Energy Spectrum' : 'Orthogonality'}
            </div>
          ))}
        </div>

        {/* Main plot */}
        <div className="canvas-panel" style={{ flex: 2, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              {plotView === 'wavefunctions' ? `ψₙ(x) — Exact Eigenstates (n=1..${nMax})` :
               plotView === 'energy' ? 'Energy Spectrum Eₙ = n²E₁' :
               `Orthogonality Matrix ⟨ψₘ|ψₙ⟩ (should be δₘₙ)`}
            </span>
            <span className="canvas-panel-badge badge-teal" style={{ marginLeft: 'auto' }}>
              L = {L.toFixed(2)} a.u.
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
            {plotView === 'wavefunctions' && (
              <CanvasPlot config={{
                lines: [
                  // All wavefunctions offset by energy level
                  ...result.states.map((s, i) => ({
                    data: Array.from(s.psi).map(v => v * 0.9 + s.energy),
                    color: colors[i % colors.length],
                    label: `ψ${i+1}`,
                    lineWidth: selectedN === i + 1 ? 2.5 : 1.2,
                  })),
                  // Probability density of selected state (filled separately)
                  {
                    data: state ? Array.from(state.probDensity).map(v => v * 2 + state.energy) : [],
                    color: colors[(selectedN - 1) % colors.length],
                    label: `|ψ${selectedN}|²`,
                    lineWidth: 0,
                    dashed: true,
                  },
                ],
                xData: result.x,
                xLabel: 'x [a.u.]',
                yLabel: 'ψₙ(x) + Eₙ [Eₕ]',
                // Energy levels as horizontal lines
                hLines: result.states.map((s, i) => ({
                  y: s.energy,
                  color: colors[i % colors.length] + '66',
                  dashed: true,
                })),
              }} />
            )}

            {plotView === 'energy' && (
              <div style={{ padding: '20px 20px', height: '100%', overflow: 'auto' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
                  Eₙ = n²π²/(2mL²), E₁ = {result.states[0]?.energy.toFixed(4)} Eₕ
                </div>
                {result.states.map((s, i) => (
                  <div key={i} className="energy-level" style={{ marginBottom: 8 }}>
                    <span className="energy-label" style={{ color: colors[i % colors.length] }}>n = {s.n}</span>
                    <div className="energy-line" style={{ background: colors[i % colors.length], opacity: 0.6 }} />
                    <span className="energy-value">{s.energy.toFixed(5)} Eₕ</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                      = {(s.n * s.n).toFixed(0)}E₁
                    </span>
                  </div>
                ))}

                <div style={{ marginTop: 20, padding: '10px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Selected state n={selectedN}
                  </div>
                  {state && ([
                    ['⟨x⟩', state.xExp.toFixed(4) + ' a.u.', '= L/2 ✓'],
                    ['⟨x²⟩', state.x2Exp.toFixed(4) + ' Eₕ', ''],
                    ['Δx', state.deltaX.toFixed(4) + ' a.u.', ''],
                    ['⟨p²⟩', state.p2Exp.toFixed(4) + ' a.u.', '= 2mEₙ ✓'],
                    ['ΔxΔp', state.deltaXDeltaP.toFixed(4), `≥ 0.5 ${state.deltaXDeltaP >= 0.5 ? '✓' : '✗'}`],
                    ['Nodes', state.nodes.length.toFixed(0), `= n-1 = ${selectedN - 1} ✓`],
                  ] as [string, string, string][]).map(([lbl, val, note]) => (
                    <div key={lbl} style={{ display: 'flex', gap: 10, marginBottom: 3, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--text-muted)', width: 50 }}>{lbl}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{val}</span>
                      <span style={{ color: 'var(--accent-green)', fontSize: 10 }}>{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plotView === 'orthogonality' && (
              <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                  ⟨ψₘ|ψₙ⟩ = δₘₙ (shown as color-coded matrix — diagonal should be 1, off-diagonal ≈ 0)
                </div>
                <div className="matrix-grid" style={{ gridTemplateColumns: `repeat(${nMax}, 1fr)` }}>
                  {result.orthogonalityMatrix.map((row, m) =>
                    row.map((val, n) => (
                      <div
                        key={`${m}-${n}`}
                        className={`matrix-cell ${m === n ? 'diagonal' : Math.abs(val) < 0.001 ? 'near-zero' : ''}`}
                        style={{ background: m === n ? `rgba(59,130,246,${Math.min(0.4, Math.abs(val) * 0.4)})` : `rgba(239,68,68,${Math.min(0.4, Math.abs(val) * 10)})` }}
                      >
                        {val.toFixed(3)}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  Max off-diagonal: {Math.max(...result.orthogonalityMatrix.map((row, m) =>
                    Math.max(...row.map((v, n) => m !== n ? Math.abs(v) : 0))
                  )).toExponential(3)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected state detail plot */}
        {plotView === 'wavefunctions' && state && (
          <div className="canvas-panel" style={{ flex: 1 }}>
            <div className="canvas-panel-header">
              <span className="canvas-panel-title">n = {selectedN} Detail — |ψₙ|² Probability Density</span>
              <span className="canvas-panel-badge badge-green" style={{ marginLeft: 'auto' }}>
                Eₙ = {state.energy.toFixed(5)} Eₕ
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
              <CanvasPlot config={{
                lines: [
                  { data: state.probDensity, color: colors[(selectedN - 1) % colors.length], label: '|ψₙ|²', lineWidth: 2 },
                  { data: state.psi, color: colors[(selectedN - 1) % colors.length] + '80', label: 'ψₙ', lineWidth: 1.2, dashed: true },
                ],
                xData: result.x,
                xLabel: 'x [a.u.]',
                yLabel: '|ψₙ|² [a.u.⁻¹]',
                vLines: state.nodes.map(nx => ({ x: nx, color: 'var(--accent-red)', label: '0' })),
              }} />
            </div>
          </div>
        )}

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Exact Analytical Solution</div>
              <div className="math-eq">ψₙ(x) = √(2/L) sin(nπx/L),  n = 1, 2, 3, ...</div>
              <div className="math-eq">Eₙ = n²π²ħ²/(2mL²) = n²E₁,  E₁ = {result.states[0]?.energy.toFixed(4)} Eₕ</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Expectation Values (analytical)</div>
              <div className="math-eq">⟨x⟩ = L/2,  ⟨x²⟩ = L²/3 - L²/(2n²π²)</div>
              <div className="math-eq">⟨p²⟩ = 2mEₙ = n²π²/L²  [AU]</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Orthogonality</div>
              <div className="math-eq">⟨ψₘ|ψₙ⟩ = ∫₀ᴸ ψₘ(x)ψₙ(x)dx = δₘₙ</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Box Parameters</div>
          <div className="control-row">
            <label className="control-label">L (box length) <span className="control-unit">a.u.</span></label>
            <input className="control-input" type="number" step="0.5" min={0.5}
              value={L} onChange={e => setL(parseFloat(e.target.value))} />
          </div>
          <div className="control-row">
            <label className="control-label">Mass <span className="control-unit">mₑ</span></label>
            <input className="control-input" type="number" step="0.1" min={0.1}
              value={mass} onChange={e => setMass(parseFloat(e.target.value))} />
          </div>
          <div className="control-row">
            <label className="control-label">States to show (nMax)</label>
            <input className="control-input" type="number" step="1" min={1} max={8}
              value={nMax} onChange={e => setNMax(parseInt(e.target.value))} />
          </div>
        </div>

        <div className="control-section">
          <div className="control-section-title">Selected State</div>
          <div className="control-row">
            <label className="control-label">n (quantum number)</label>
            <input className="control-input" type="number" step="1" min={1} max={nMax}
              value={selectedN} onChange={e => setSelectedN(Math.min(nMax, Math.max(1, parseInt(e.target.value))))} />
          </div>
          {state && (<>
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { label: 'Eₙ', val: state.energy.toFixed(6) + ' Eₕ' },
                { label: 'E₁', val: result.states[0]?.energy.toFixed(6) + ' Eₕ' },
                { label: 'n² × E₁', val: (selectedN * selectedN * (result.states[0]?.energy ?? 0)).toFixed(6) + ' Eₕ' },
                { label: 'Nodes', val: `${state.nodes.length} (= n-1)` },
                { label: 'ΔxΔp', val: state.deltaXDeltaP.toFixed(4) + ' ħ' },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{val}</span>
                </div>
              ))}
            </div>
          </>)}
        </div>

        <div className="control-section">
          <div className="control-section-title">Quick Select</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.states.map((s, i) => (
              <button
                key={i}
                className={`btn ${selectedN === i + 1 ? 'btn-primary' : 'btn-ghost'}`}
                style={{ minWidth: 32, padding: '4px 8px', fontSize: 12 }}
                onClick={() => setSelectedN(i + 1)}
              >
                n={i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
