import { useState, useMemo, useCallback } from 'react';
import { solveParticleInBox } from '../../physics/modules/particleInBox';
import { projectiveMeasure, repeatedMeasurement } from '../../physics/modules/quantumMeasurement';
import { ComplexArray } from '../../physics/utils/complex';
import CanvasPlot from '../charts/CanvasPlot';

const N_GRID = 256;
const L = 10.0;
const COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#22c55e', '#ef4444', '#f97316', '#ec4899'];

type StateType = 'ground' | 'superposition' | 'gaussian';

export default function QuantumMeasurementModule() {
  const [stateType, setStateType] = useState<StateType>('superposition');
  const [nBasis, setNBasis] = useState(5);
  const [nTrials, setNTrials] = useState(1000);
  const [collapseHistory, setCollapseHistory] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'state' | 'probabilities' | 'repeated' | 'reconstruction'>('state');

  // Build eigenbasis
  const boxResult = useMemo(() => solveParticleInBox({ L, mass: 1, N: N_GRID, nMax: nBasis }), [nBasis]);
  const dx = boxResult.dx;

  const eigenstates = useMemo(() =>
    boxResult.states.map(s => new ComplexArray(N_GRID, (i) => [s.psi[i], 0])),
    [boxResult]
  );
  const eigenvalues = useMemo(() => Array.from(boxResult.energySpectrum), [boxResult]);

  // Build state to measure
  const psi = useMemo((): ComplexArray => {
    switch (stateType) {
      case 'ground':
        return eigenstates[0]?.clone() ?? new ComplexArray(N_GRID);

      case 'superposition': {
        // Equal superposition of n=1,2,3
        const psi = new ComplexArray(N_GRID);
        const c = 1 / Math.sqrt(3);
        for (let n = 0; n < Math.min(3, eigenstates.length); n++) {
          for (let i = 0; i < N_GRID; i++) {
            psi.data[2 * i]     += c * eigenstates[n].re(i);
            psi.data[2 * i + 1] += c * eigenstates[n].im(i);
          }
        }
        return psi;
      }

      case 'gaussian': {
        // Gaussian packet centered in box
        const psi = new ComplexArray(N_GRID, (i) => {
          const xi = boxResult.x[i];
          const x0 = L / 2;
          const sigma = 1.5;
          return [Math.exp(-(xi - x0) * (xi - x0) / (4 * sigma * sigma)), 0];
        });
        psi.normalize(dx);
        return psi;
      }
    }
  }, [stateType, eigenstates, boxResult.x, dx]);

  // Compute probabilities: |cₙ|² = |⟨φₙ|ψ⟩|²
  const probabilities = useMemo(() => {
    const probs: number[] = [];
    for (let n = 0; n < eigenstates.length; n++) {
      let re = 0, im = 0;
      for (let i = 0; i < N_GRID; i++) {
        re += eigenstates[n].re(i) * psi.re(i) + eigenstates[n].im(i) * psi.im(i);
        im += eigenstates[n].re(i) * psi.im(i) - eigenstates[n].im(i) * psi.re(i);
      }
      probs.push((re * re + im * im) * dx * dx);
    }
    return probs;
  }, [psi, eigenstates, dx]);

  // Repeated measurement simulation
  const repeatedData = useMemo(() => {
    return repeatedMeasurement(psi, { eigenstates, eigenvalues, dx }, nTrials);
  }, [psi, eigenstates, eigenvalues, dx, nTrials]);

  // Single measurement
  const performMeasurement = useCallback(() => {
    const res = projectiveMeasure(psi, { eigenstates, eigenvalues, dx });
    setCollapseHistory(h => [...h.slice(-49), res.chosenOutcome + 1]);
  }, [psi, eigenstates, eigenvalues, dx]);

  const normCheck = probabilities.reduce((s, p) => s + p, 0);

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Tabs */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0' }}>
          {(['state', 'probabilities', 'repeated', 'reconstruction'] as const).map(t => (
            <div key={t} className={`module-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'state' ? 'State ψ' : t === 'probabilities' ? 'Probabilities |cₙ|²' : t === 'repeated' ? 'Repeated Measurement' : 'State Reconstruction'}
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div className="canvas-panel" style={{ flex: 2, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              {activeTab === 'state' ? `State: |ψ⟩ (${stateType})` :
               activeTab === 'probabilities' ? 'Born Rule Probability Distribution' :
               activeTab === 'repeated' ? `Repeated Measurement (${nTrials} trials)` :
               'State Reconstruction from Frequencies'}
            </span>
            <span className="canvas-panel-badge badge-blue" style={{ marginLeft: 'auto' }}>
              Σ|cₙ|² = {normCheck.toFixed(5)} {Math.abs(normCheck - 1) < 0.01 ? '✓' : '✗'}
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: activeTab === 'probabilities' || activeTab === 'repeated' || activeTab === 'reconstruction' ? '12px 16px' : '4px 0', overflow: 'auto' }}>
            {activeTab === 'state' && (
              <CanvasPlot config={{
                lines: [
                  { data: psi.toProbabilityDensity(), color: 'var(--plot-prob)', label: '|ψ|²', lineWidth: 2 },
                  { data: psi.toReArray(), color: 'var(--plot-psi-re)', label: 'Re(ψ)', lineWidth: 1.2, dashed: true },
                  ...boxResult.states.map((s, i) => ({
                    data: Array.from(s.psi).map(v => v * 0.3 * probabilities[i] * 10),
                    color: COLORS[i % COLORS.length],
                    label: `ψ${i+1} (w=${probabilities[i]?.toFixed(2)})`,
                    lineWidth: 1,
                    dashed: true,
                  })),
                ],
                xData: boxResult.x,
                xLabel: 'x [a.u.]',
                yLabel: '|ψ|²',
              }} />
            )}

            {activeTab === 'probabilities' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Probability Pₙ = |⟨φₙ|ψ⟩|² of measuring eigenstate n with energy Eₙ
                </div>
                <CanvasPlot config={{
                  lines: [{
                    data: probabilities,
                    color: 'var(--accent-teal)',
                    label: '|cₙ|²',
                    lineWidth: 2,
                  }],
                  xData: eigenvalues.map((_, i) => i + 1),
                  xLabel: 'n (quantum number)',
                  yLabel: 'Probability |cₙ|²',
                  yMin: 0, yMax: 1,
                }} height={200} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {probabilities.map((p, i) => (
                    <div key={i} style={{ background: COLORS[i % COLORS.length] + '22', border: `1px solid ${COLORS[i % COLORS.length]}44`, borderRadius: 5, padding: '6px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', minWidth: 120 }}>
                      <div style={{ color: COLORS[i % COLORS.length] }}>n = {i + 1}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>Pₙ = {p.toFixed(5)}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>E = {eigenvalues[i]?.toFixed(4)} Eₕ</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'repeated' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {nTrials} measurements on identical copies of |ψ⟩. Frequencies should converge to |cₙ|² (Born rule).
                </div>
                <CanvasPlot config={{
                  lines: [
                    { data: repeatedData.frequencies, color: 'var(--accent-primary)', label: 'Frequency (measured)', lineWidth: 0 },
                    { data: repeatedData.theoreticalProbs, color: 'var(--accent-red)', label: '|cₙ|² (theoretical)', lineWidth: 1.5, dashed: true },
                  ],
                  xData: eigenvalues.map((_, i) => i + 1),
                  xLabel: 'n',
                  yLabel: 'Probability',
                  yMin: 0, yMax: 1,
                }} height={180} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  {repeatedData.frequencies.map((f, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                      <div style={{ color: COLORS[i % COLORS.length] }}>n={i+1}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>freq: {f.toFixed(4)}</div>
                      <div style={{ color: 'var(--text-muted)' }}>theo: {repeatedData.theoreticalProbs[i]?.toFixed(4)}</div>
                    </div>
                  ))}
                </div>
                <div className="highlight-box">
                  χ² goodness-of-fit: {repeatedData.chiSquared.toFixed(4)}
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                    (smaller → better convergence to Born rule)
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'reconstruction' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Reconstructed state probabilities from {nTrials}-trial measurement frequencies vs theoretical
                </div>
                <CanvasPlot config={{
                  lines: [
                    { data: repeatedData.frequencies, color: 'var(--accent-primary)', label: 'Reconstructed |cₙ|²', lineWidth: 2 },
                    { data: repeatedData.theoreticalProbs, color: 'var(--accent-red)', label: 'True |cₙ|²', lineWidth: 1.5, dashed: true },
                    { data: repeatedData.frequencies.map((f, i) => Math.abs(f - (repeatedData.theoreticalProbs[i] ?? 0))), color: 'var(--accent-amber)', label: 'Error', lineWidth: 1 },
                  ],
                  xData: eigenvalues.map((_, i) => i + 1),
                  xLabel: 'n',
                  yLabel: 'Probability',
                  yMin: 0,
                }} height={160} />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div className="obs-item">
                    <div className="obs-label">Max error</div>
                    <div className="obs-value">{Math.max(...repeatedData.frequencies.map((f, i) => Math.abs(f - (repeatedData.theoreticalProbs[i] ?? 0)))).toFixed(5)}</div>
                  </div>
                  <div className="obs-item">
                    <div className="obs-label">Reconstructed ⟨E⟩</div>
                    <div className="obs-value">{repeatedData.frequencies.reduce((s, f, i) => s + f * (eigenvalues[i] ?? 0), 0).toFixed(5)} Eₕ</div>
                  </div>
                  <div className="obs-item">
                    <div className="obs-label">True ⟨E⟩</div>
                    <div className="obs-value">{probabilities.reduce((s, p, i) => s + p * (eigenvalues[i] ?? 0), 0).toFixed(5)} Eₕ</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapse history */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Single Measurement History
            </div>
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={performMeasurement}>
              ⚡ Measure Now
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 30 }}>
            {collapseHistory.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click "Measure Now" to collapse the wavefunction</span>
            )}
            {collapseHistory.map((n, i) => (
              <span key={i} style={{
                background: COLORS[(n - 1) % COLORS.length] + '30',
                border: `1px solid ${COLORS[(n - 1) % COLORS.length]}60`,
                borderRadius: 4, padding: '2px 8px', fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: COLORS[(n - 1) % COLORS.length],
              }}>
                n={n}
              </span>
            ))}
          </div>
        </div>

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Born Rule</div>
              <div className="math-eq">P(aₙ) = |⟨φₙ|ψ⟩|² = |cₙ|²</div>
              <div className="math-eq">|ψ⟩ → |φₙ⟩ after measurement (collapse)</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Expansion</div>
              <div className="math-eq">|ψ⟩ = Σₙ cₙ|φₙ⟩,  cₙ = ⟨φₙ|ψ⟩</div>
              <div className="math-eq">Σₙ|cₙ|² = 1 (completeness)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Quantum State</div>
          <select className="control-select" value={stateType}
            onChange={e => setStateType(e.target.value as StateType)}>
            <option value="ground">Ground State (n=1)</option>
            <option value="superposition">Superposition (n=1,2,3)</option>
            <option value="gaussian">Gaussian Packet</option>
          </select>
        </div>

        <div className="control-section">
          <div className="control-section-title">Basis Size</div>
          <div className="control-row">
            <label className="control-label">Eigenstates n_max</label>
            <input className="control-input" type="number" step="1" min={2} max={8}
              value={nBasis} onChange={e => setNBasis(parseInt(e.target.value))} />
          </div>
        </div>

        <div className="control-section">
          <div className="control-section-title">Repeated Measurement</div>
          <div className="control-row">
            <label className="control-label">Number of trials</label>
            <select className="control-select" value={nTrials}
              onChange={e => setNTrials(parseInt(e.target.value))}>
              {[100, 500, 1000, 5000, 10000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
          </div>
        </div>

        {/* Probabilities summary */}
        <div className="control-section">
          <div className="control-section-title">|cₙ|² Summary</div>
          {probabilities.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: COLORS[i % COLORS.length], minWidth: 24 }}>n={i+1}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${p * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>
                {(p * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
