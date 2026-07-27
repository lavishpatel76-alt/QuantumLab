import { useState, useEffect, useRef, useCallback } from 'react';
import { SchrodingerSimulation, SchrodingerParams, PotentialType } from '../../physics/modules/schrodinger';
import { fft, kFrequencies, fftShift } from '../../physics/utils/fft';
import { ComplexArray } from '../../physics/utils/complex';
import CanvasPlot from '../charts/CanvasPlot';

const STORAGE_KEY = 'ql_schrodinger_params';

const DEFAULT_PARAMS: SchrodingerParams = {
  potentialType: 'harmonic',
  N: 512,
  xMin: -20,
  xMax: 20,
  dt: 0.005,
  mass: 1,
  x0: -8,
  sigma: 2,
  k0: 3,
  wellDepth: 10,
  wellWidth: 10,
  omega: 0.5,
  customExpr: '0.5 * m * omega * omega * x * x',
};

function loadParams(): SchrodingerParams {
  try { return { ...DEFAULT_PARAMS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return DEFAULT_PARAMS; }
}

export default function SchrodingerModule() {
  const [params, setParams] = useState<SchrodingerParams>(loadParams);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'wavefunction' | 'probability' | 'phase' | 'momentum'>('wavefunction');
  const [mathTab, setMathTab] = useState<'equations' | 'numerics' | 'validation'>('equations');
  const simRef = useRef<SchrodingerSimulation | null>(null);
  const rafRef = useRef<number>(0);
  const stepsPerFrame = 10;

  const [state, setState] = useState<ReturnType<SchrodingerSimulation['getState']> | null>(null);
  const [stability, setStability] = useState<{ stable: boolean; reason?: string }>({ stable: true });
  const [computeMs, setComputeMs] = useState(0);

  const buildSim = useCallback(() => {
    simRef.current = new SchrodingerSimulation(params);
    setState(simRef.current.getState());
    setStability(simRef.current.checkStability());
  }, [params]);

  useEffect(() => { buildSim(); }, [buildSim]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      if (!simRef.current) return;
      const t0 = performance.now();
      simRef.current.advance(stepsPerFrame);
      setComputeMs(performance.now() - t0);
      setState(simRef.current.getState());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const reset = () => { setRunning(false); buildSim(); };

  const setParam = <K extends keyof SchrodingerParams>(k: K, v: SchrodingerParams[K]) => {
    setParams(p => ({ ...p, [k]: v }));
    setRunning(false);
  };

  const normErr = state ? Math.abs(state.obs.normSquared - 1) : 0;
  const heisenberg = state ? state.obs.deltaXDeltaP : 0;

  // Build momentum space data for display
  const [kGrid, setKGrid] = useState<Float64Array>(new Float64Array());
  const [momDensity, setMomDensity] = useState<Float64Array>(new Float64Array());

  useEffect(() => {
    if (!state) return;
    // Compute momentum distribution using FFT on current psi
    const N = state.psiRe.length;
    const dx = (params.xMax - params.xMin) / N;
    const psiCA = new ComplexArray(N, (i) => [state.psiRe[i], state.psiIm[i]]);
    fft(psiCA, false);
    const shifted = fftShift(psiCA);
    const dk = (2 * Math.PI) / (N * dx);
    const k = new Float64Array(N);
    const mom = new Float64Array(N);
    let total = 0;
    for (let i = 0; i < N; i++) {
      k[i] = (i - N / 2) * dk;
      mom[i] = shifted.abs2(i) / N;
      total += mom[i];
    }
    for (let i = 0; i < N; i++) mom[i] /= (total * dk || 1);
    setKGrid(k);
    setMomDensity(mom);
  }, [state?.step]);

  const potColors: Record<PotentialType, string> = {
    free: 'rgba(245,158,11,0.3)',
    infinite_well: 'rgba(245,158,11,0.4)',
    finite_well: 'rgba(20,184,166,0.3)',
    harmonic: 'rgba(168,85,247,0.3)',
    custom: 'rgba(59,130,246,0.3)',
  };

  return (
    <div className="module-container">
      {/* ── Canvas Area ── */}
      <div className="canvas-area">
        {/* Warning */}
        {!stability.stable && (
          <div className="warning-banner">
            ⚠ Numerical instability: {stability.reason}
          </div>
        )}

        {/* Module tabs */}
        <div className="module-tabs" style={{ borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0', background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none' }}>
          {(['wavefunction', 'probability', 'phase', 'momentum'] as const).map(t => (
            <div key={t} className={`module-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'wavefunction' ? 'Wave Function' : t === 'probability' ? 'Probability Density' : t === 'phase' ? 'Phase' : 'Momentum Space'}
            </div>
          ))}
        </div>

        {/* Main plot */}
        <div className="canvas-panel" style={{ flex: 1.5, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              {activeTab === 'wavefunction' ? 'ψ(x,t) — Real & Imaginary Components' :
               activeTab === 'probability' ? '|ψ(x,t)|² — Probability Density' :
               activeTab === 'phase' ? 'arg(ψ) — Phase' :
               '|ψ̃(k)|² — Momentum Distribution'}
            </span>
            {state && (
              <span className="canvas-panel-badge badge-blue" style={{ marginLeft: 'auto' }}>
                t = {state.t.toFixed(3)} a.u.
              </span>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
            {activeTab === 'wavefunction' && state && (
              <CanvasPlot config={{
                lines: [
                  { data: state.psiRe, color: 'var(--plot-psi-re)', label: 'Re(ψ)', lineWidth: 1.5 },
                  { data: state.psiIm, color: 'var(--plot-psi-im)', label: 'Im(ψ)', lineWidth: 1.5 },
                  { data: Array.from(state.V).map(v => v / 20), color: 'var(--plot-potential)', label: 'V (scaled)', lineWidth: 1, dashed: true },
                ],
                xData: state.x,
                xLabel: 'x [a.u.]',
                yLabel: 'ψ(x) [a.u.⁻¹/²]',
              }} />
            )}
            {activeTab === 'probability' && state && (
              <CanvasPlot config={{
                lines: [
                  { data: state.probDensity, color: 'var(--plot-prob)', label: '|ψ|²', lineWidth: 2 },
                  { data: Array.from(state.V).map(v => v / 100), color: 'var(--plot-potential)', label: 'V (scaled)', lineWidth: 1, dashed: true },
                ],
                xData: state.x,
                xLabel: 'x [a.u.]',
                yLabel: '|ψ|² [a.u.⁻¹]',
              }} />
            )}
            {activeTab === 'phase' && state && (
              <CanvasPlot config={{
                lines: [{ data: state.phase, color: 'var(--plot-phase)', label: 'arg(ψ)', lineWidth: 1.5 }],
                xData: state.x,
                xLabel: 'x [a.u.]',
                yLabel: 'phase [rad]',
                yMin: -Math.PI,
                yMax: Math.PI,
              }} />
            )}
            {activeTab === 'momentum' && kGrid.length > 0 && (
              <CanvasPlot config={{
                lines: [{ data: momDensity, color: 'var(--plot-momentum)', label: '|ψ̃(k)|²', lineWidth: 1.5 }],
                xData: kGrid,
                xLabel: 'k [a.u.]',
                yLabel: '|ψ̃|² [a.u.]',
                hLines: [{ y: 0, color: 'var(--border-default)', dashed: false }],
              }} />
            )}
          </div>

          {/* Legend */}
          <div className="plot-legend" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
            {activeTab === 'wavefunction' && (<>
              <div className="legend-item"><div className="legend-line" style={{ background: 'var(--plot-psi-re)' }} />Re(ψ)</div>
              <div className="legend-item"><div className="legend-line" style={{ background: 'var(--plot-psi-im)' }} />Im(ψ)</div>
              <div className="legend-item"><div className="legend-line" style={{ background: 'var(--plot-potential)', height: 1, borderBottom: '1px dashed' }} />V(x)</div>
            </>)}
            {activeTab === 'probability' && (
              <div className="legend-item"><div className="legend-line" style={{ background: 'var(--plot-prob)' }} />|ψ(x,t)|²</div>
            )}
          </div>
        </div>

        {/* Observables grid */}
        {state && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)' }}>
            <div style={{ display: 'flex', gap: 16, padding: '8px 14px', flexWrap: 'wrap' }}>
              {[
                { label: '⟨x⟩', value: state.obs.xExp.toFixed(4), unit: 'a.u.' },
                { label: '⟨p⟩', value: state.obs.pExp.toFixed(4), unit: 'a.u.' },
                { label: 'Δx', value: state.obs.deltaX.toFixed(4), unit: 'a.u.' },
                { label: 'Δp', value: state.obs.deltaP.toFixed(4), unit: 'a.u.' },
                { label: 'ΔxΔp', value: heisenberg.toFixed(4), unit: 'ħ', cls: heisenberg >= 0.499 ? 'good' : 'error' },
                { label: 'E_kin', value: state.obs.energyKinetic.toFixed(4), unit: 'Eₕ' },
                { label: 'E_tot', value: state.energyTotal.toFixed(4), unit: 'Eₕ' },
                { label: '∫|ψ|²dx', value: state.obs.normSquared.toFixed(6), unit: '', cls: normErr < 1e-6 ? 'good' : normErr < 1e-4 ? 'warn' : 'error' },
              ].map(({ label, value, unit, cls }) => (
                <div key={label} className="obs-item">
                  <div className="obs-label">{label}</div>
                  <div className={`obs-value ${cls || ''}`}>{value} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{unit}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Math Panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-tabs">
            {(['equations', 'numerics', 'validation'] as const).map(t => (
              <div key={t} className={`math-tab ${mathTab === t ? 'active' : ''}`} onClick={() => setMathTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </div>
            ))}
          </div>
          <div className="math-panel-content">
            {mathTab === 'equations' && (<>
              <div className="math-block">
                <div className="math-block-label">Governing Equation</div>
                <div className="math-eq">iħ ∂ψ/∂t = [-ħ²/(2m) ∂²/∂x² + V(x)] ψ</div>
                <div className="math-eq" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                  Atomic units: ħ=1, mₑ=1 → i ∂ψ/∂t = [-½∂²/∂x² + V(x)]ψ
                </div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Boundary Conditions</div>
                <div className="math-eq">ψ({params.xMin.toFixed(1)},t) = ψ({params.xMax.toFixed(1)},t) = 0</div>
                <div className="math-eq" style={{ marginTop: 4, color: 'var(--text-muted)' }}>Absorbing boundaries via grid truncation</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Initial Condition</div>
                <div className="math-eq">ψ(x,0) = (2πσ²)^(-1/4) exp[-(x-x₀)²/(4σ²)] exp[ik₀(x-x₀)]</div>
              </div>
            </>)}
            {mathTab === 'numerics' && (<>
              <div className="math-block">
                <div className="math-block-label">Algorithm: Split-Step Fourier (Strang Splitting)</div>
                <div className="math-eq">ψ(t+Δt) = e^(-iV·Δt/2) · F⁻¹[e^(-ik²Δt/2m) · F[e^(-iV·Δt/2) ψ(t)]]</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Grid Parameters</div>
                <div className="math-eq">N = {params.N} points, Δx = {((params.xMax - params.xMin) / params.N).toFixed(4)} a.u.</div>
                <div className="math-eq">Δt = {params.dt} a.u., steps/frame = {stepsPerFrame}</div>
                <div className="math-eq" style={{ color: 'var(--text-muted)' }}>Order: 2nd-order in time (Strang), spectral in space</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Performance</div>
                <div className="math-eq">{computeMs.toFixed(1)} ms/frame · {(stepsPerFrame / computeMs * 1000).toFixed(0)} steps/s</div>
              </div>
            </>)}
            {mathTab === 'validation' && state && (<>
              <div className="math-block">
                <div className="math-block-label">Normalization Check</div>
                <div className={`math-eq ${normErr < 1e-6 ? 'good' : normErr < 1e-4 ? 'warn' : 'error'}`}>
                  |1 - ∫|ψ|²dx| = {normErr.toExponential(3)}
                </div>
                <div className="math-eq" style={{ color: 'var(--text-muted)' }}>Threshold: 10⁻⁶ (split-step conserves norm exactly)</div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Heisenberg Uncertainty</div>
                <div className={`math-eq ${heisenberg >= 0.499 ? 'good' : 'error'}`}>
                  ΔxΔp = {heisenberg.toFixed(6)} ≥ ħ/2 = 0.5 a.u. {heisenberg >= 0.499 ? '✓' : '✗'}
                </div>
              </div>
              <div className="math-block">
                <div className="math-block-label">Energy Conservation</div>
                <div className="math-eq" style={{ color: 'var(--text-muted)' }}>
                  E_tot = {state.energyTotal.toFixed(6)} Eₕ
                </div>
              </div>
            </>)}
          </div>
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div className="control-panel">
        {/* Simulation controls */}
        <div className="control-section">
          <div className="control-section-title">Simulation</div>
          <div className="btn-row">
            <button className={`btn ${running ? 'btn-danger' : 'btn-primary'}`} onClick={() => setRunning(r => !r)}>
              {running ? '⏸ Pause' : '▶ Run'}
            </button>
            <button className="btn btn-secondary" onClick={reset}>↺ Reset</button>
            <button className="btn btn-ghost" onClick={() => {
              if (!state) return;
              const csv = ['x,psiRe,psiIm,probDensity,V'];
              for (let i = 0; i < state.x.length; i++) {
                csv.push(`${state.x[i]},${state.psiRe[i]},${state.psiIm[i]},${state.probDensity[i]},${state.V[i]}`);
              }
              const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'schrodinger.csv'; a.click();
            }}>↓ CSV</button>
          </div>
        </div>

        {/* Potential */}
        <div className="control-section">
          <div className="control-section-title">Potential</div>
          <div className="control-row">
            <label className="control-label">Type</label>
            <select className="control-select" value={params.potentialType}
              onChange={e => setParam('potentialType', e.target.value as PotentialType)}>
              <option value="free">Free Particle</option>
              <option value="infinite_well">Infinite Well</option>
              <option value="finite_well">Finite Well</option>
              <option value="harmonic">Harmonic</option>
              <option value="custom">Custom V(x)</option>
            </select>
          </div>
          {params.potentialType === 'harmonic' && (
            <div className="control-row">
              <label className="control-label">ω <span className="control-unit">a.u.</span></label>
              <input className="control-input" type="number" step="0.1" value={params.omega}
                onChange={e => setParam('omega', parseFloat(e.target.value))} />
            </div>
          )}
          {(params.potentialType === 'infinite_well' || params.potentialType === 'finite_well') && (<>
            <div className="control-row">
              <label className="control-label">Width <span className="control-unit">a.u.</span></label>
              <input className="control-input" type="number" step="0.5" value={params.wellWidth}
                onChange={e => setParam('wellWidth', parseFloat(e.target.value))} />
            </div>
            {params.potentialType === 'finite_well' && (
              <div className="control-row">
                <label className="control-label">V₀ <span className="control-unit">Eₕ</span></label>
                <input className="control-input" type="number" step="1" value={params.wellDepth}
                  onChange={e => setParam('wellDepth', parseFloat(e.target.value))} />
              </div>
            )}
          </>)}
          {params.potentialType === 'custom' && (
            <div className="control-row">
              <label className="control-label">V(x) expression</label>
              <input className="control-input" type="text" value={params.customExpr}
                placeholder="e.g. 0.5*m*omega*omega*x*x"
                onChange={e => setParam('customExpr', e.target.value)} />
            </div>
          )}
        </div>

        {/* Wave packet */}
        <div className="control-section">
          <div className="control-section-title">Wave Packet</div>
          {[
            { key: 'x0' as const, label: 'x₀ (center)', unit: 'a.u.', step: 0.5 },
            { key: 'sigma' as const, label: 'σ (width)', unit: 'a.u.', step: 0.1, min: 0.1 },
            { key: 'k0' as const, label: 'k₀ (momentum)', unit: 'a.u.', step: 0.5 },
          ].map(({ key, label, unit, step, min }) => (
            <div key={key} className="control-row">
              <label className="control-label">{label} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={params[key]} onChange={e => setParam(key, parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="control-section">
          <div className="control-section-title">Grid & Time</div>
          <div className="control-row">
            <label className="control-label">Grid points N</label>
            <select className="control-select" value={params.N}
              onChange={e => setParam('N', parseInt(e.target.value))}>
              {[256, 512, 1024].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="control-row">
            <label className="control-label">Δt <span className="control-unit">a.u.</span></label>
            <input className="control-input" type="number" step="0.001" min={0.0001} value={params.dt}
              onChange={e => setParam('dt', parseFloat(e.target.value))} />
          </div>
          <div className="control-row">
            <label className="control-label">Mass <span className="control-unit">mₑ</span></label>
            <input className="control-input" type="number" step="0.1" min={0.1} value={params.mass}
              onChange={e => setParam('mass', parseFloat(e.target.value))} />
          </div>
        </div>

        {/* Status */}
        <div className="status-row">
          <span className={`validation-indicator ${!stability.stable ? 'ind-error' : normErr < 1e-5 ? 'ind-ok' : 'ind-warn'}`} />
          <span className="status-label">Step:</span>
          <span className="status-value">{state?.step ?? 0}</span>
          <span className="status-label" style={{ marginLeft: 8 }}>t =</span>
          <span className="status-value">{state?.t.toFixed(3) ?? '0.000'}</span>
        </div>
      </div>
    </div>
  );
}
