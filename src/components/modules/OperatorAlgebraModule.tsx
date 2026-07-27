import { useState, useMemo } from 'react';
import {
  buildXOperator, buildPOperator, buildTOperator, buildHamiltonian,
  commutator, expectationValue, getDisplayMatrix, OperatorMatrix,
} from '../../physics/modules/operatorAlgebra';
import CanvasPlot from '../charts/CanvasPlot';
import { ComplexArray } from '../../physics/utils/complex';

type OperatorId = 'x' | 'p' | 'T' | 'H';

const N_GRID = 32; // Small grid for matrix display
const X_RANGE = 8;

export default function OperatorAlgebraModule() {
  const [opA, setOpA] = useState<OperatorId>('x');
  const [opB, setOpB] = useState<OperatorId>('p');
  const [omega, setOmega] = useState(1.0);
  const [mass, setMass] = useState(1.0);
  const [displayN, setDisplayN] = useState(6);
  const [activeTab, setActiveTab] = useState<'commutator' | 'matrices' | 'expectation'>('commutator');

  // Build operators on small grid
  const x = useMemo(() => {
    const arr = new Float64Array(N_GRID);
    for (let i = 0; i < N_GRID; i++) arr[i] = -X_RANGE + i * 2 * X_RANGE / (N_GRID - 1);
    return arr;
  }, []);

  const V = useMemo(() => {
    return Float64Array.from(x.map(xi => 0.5 * mass * omega * omega * xi * xi));
  }, [x, omega, mass]);

  const operators: Record<OperatorId, OperatorMatrix> = useMemo(() => ({
    x: buildXOperator(x),
    p: buildPOperator(x),
    T: buildTOperator(x, mass),
    H: buildHamiltonian(x, V, mass),
  }), [x, V, mass]);

  const A = operators[opA];
  const B = operators[opB];

  const commResult = useMemo(() => commutator(A, B), [A, B]);

  const dispA = useMemo(() => getDisplayMatrix(A, displayN), [A, displayN]);
  const dispB = useMemo(() => getDisplayMatrix(B, displayN), [B, displayN]);
  const dispC = useMemo(() => getDisplayMatrix(commResult.commutator, displayN), [commResult, displayN]);

  // Reference wavefunction (ground state Gaussian)
  const refPsi = useMemo(() => {
    return new ComplexArray(N_GRID, (i) => {
      const xi = x[i];
      const val = Math.exp(-xi * xi / 4);
      return [val, 0];
    });
  }, [x]);

  // Normalize
  const dx = x[1] - x[0];
  refPsi.normalize(dx);

  const expA = expectationValue(refPsi, A);
  const expB = expectationValue(refPsi, B);
  const expC = expectationValue(refPsi, commResult.commutator);

  // Known analytical commutator results
  const analyticalCommutator: Record<string, string> = {
    'x-p': '[x̂, p̂] = iħ = i (AU)',
    'p-x': '[p̂, x̂] = -iħ = -i (AU)',
    'x-T': '[x̂, T̂] = iħp̂/m (AU: ip̂)',
    'T-x': '[T̂, x̂] = -iħp̂/m',
    'p-H': '[p̂, Ĥ] = -iħ·dV/dx = -iħmω²x',
    'H-p': '[Ĥ, p̂] = iħmω²x',
    'x-H': '[x̂, Ĥ] = iħp̂/m',
    'H-x': '[Ĥ, x̂] = -iħp̂/m',
    'T-H': '[T̂, Ĥ] = [T̂,V̂] = iħ(pV\'+V\'p)/(2m)',
    'H-T': '[Ĥ, T̂] = [V̂,T̂]',
  };
  const commKey = `${opA}-${opB}`;
  const analytical = analyticalCommutator[commKey] ?? 'Not pre-computed';

  const opNames: Record<OperatorId, string> = { x: 'x̂', p: 'p̂', T: 'T̂ (kinetic)', H: 'Ĥ (harmonic)' };

  function MatrixDisplay({ disp, title, color }: { disp: ReturnType<typeof getDisplayMatrix>; title: string; color: string }) {
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{title}</div>
        <div style={{ overflowX: 'auto' }}>
          <div className="matrix-grid" style={{ gridTemplateColumns: `repeat(${disp.size}, 1fr)` }}>
            {disp.re.map((row, i) =>
              row.map((val, j) => {
                const isD = i === j;
                const magn = Math.sqrt(val * val + disp.im[i][j] * disp.im[i][j]);
                return (
                  <div
                    key={`${i}-${j}`}
                    className={`matrix-cell ${isD ? 'diagonal' : Math.abs(val) < 0.001 ? 'near-zero' : ''}`}
                    style={{ background: isD ? `${color}20` : `rgba(0,0,0,0)`, color: isD ? color : undefined }}
                    title={`[${i},${j}] = ${val.toFixed(3)} + ${disp.im[i][j].toFixed(3)}i`}
                  >
                    {Math.abs(magn) < 0.001 ? '0' : val.toFixed(2)}
                    {Math.abs(disp.im[i][j]) > 0.001 && (
                      <span style={{ fontSize: 8, opacity: 0.7 }}>
                        {disp.im[i][j] > 0 ? '+' : ''}{disp.im[i][j].toFixed(2)}i
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Tabs */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0' }}>
          {(['commutator', 'matrices', 'expectation'] as const).map(t => (
            <div key={t} className={`module-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t === 'commutator' ? 'Commutator [A,B]' : t === 'matrices' ? 'Matrix Elements' : 'Expectation Values'}
            </div>
          ))}
        </div>

        <div className="canvas-panel" style={{ flex: 2, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              [{opNames[opA]}, {opNames[opB]}] = {opNames[opA]}·{opNames[opB]} − {opNames[opB]}·{opNames[opA]}
            </span>
          </div>

          <div style={{ flex: 1, padding: '12px 16px', overflow: 'auto' }}>
            {activeTab === 'commutator' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Analytical result */}
                <div className="highlight-box">
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Analytical Result</div>
                  <div style={{ fontSize: 13, color: 'var(--accent-teal)' }}>{analytical}</div>
                </div>

                {/* Numerical Tr([A,B]) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { lbl: 'Tr([A,B]) Re', val: commResult.commutatorTrace[0].toExponential(3) },
                    { lbl: 'Tr([A,B]) Im', val: commResult.commutatorTrace[1].toExponential(3) },
                    { lbl: '[A,B] Frobenius', val: Math.sqrt(commResult.commutator.dataRe.reduce((s, v, i) => s + v*v + commResult.commutator.dataIm[i]**2, 0)).toFixed(4) },
                  ].map(({ lbl, val }) => (
                    <div key={lbl} className="obs-item">
                      <div className="obs-label">{lbl}</div>
                      <div className="obs-value" style={{ fontSize: 12 }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Commutator matrix display */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                    [A,B] Matrix (center {displayN}×{displayN} block, Re part):
                  </div>
                  <MatrixDisplay disp={dispC} title="" color="var(--accent-teal)" />
                </div>

                {/* [x,p] = i canonical check */}
                {commKey === 'x-p' && (
                  <div className="highlight-box" style={{ background: 'rgba(20,184,166,0.08)', borderColor: 'rgba(20,184,166,0.3)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Canonical Commutation Relation Check</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent-teal)' }}>
                      [x̂, p̂] should = i·1̂ (imaginary unit times identity, in AU)<br />
                      Im diagonal ≈ 1: {(commResult.commutatorTrace[1] / N_GRID).toFixed(6)} {Math.abs(commResult.commutatorTrace[1] / N_GRID - 1) < 0.1 ? '≈ 1 ✓' : ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'matrices' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <MatrixDisplay disp={dispA} title={`${opNames[opA]} (${displayN}×${displayN} center block, Re)`} color="var(--accent-primary)" />
                <MatrixDisplay disp={dispB} title={`${opNames[opB]} (${displayN}×${displayN} center block, Re)`} color="var(--accent-purple)" />
              </div>
            )}

            {activeTab === 'expectation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="highlight-box">
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Reference state: ψ(x) ∝ e^(-x²/4) (Gaussian, normalized)</div>
                </div>
                {[
                  { lbl: `⟨${opNames[opA]}⟩`, re: expA[0], im: expA[1] },
                  { lbl: `⟨${opNames[opB]}⟩`, re: expB[0], im: expB[1] },
                  { lbl: `⟨[${opNames[opA]},${opNames[opB]}]⟩`, re: expC[0], im: expC[1] },
                ].map(({ lbl, re, im }) => (
                  <div key={lbl} style={{ display: 'flex', gap: 20, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minWidth: 120 }}>{lbl} =</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      <span style={{ color: 'var(--accent-primary)' }}>{re.toFixed(6)}</span>
                      <span style={{ color: 'var(--text-muted)' }}> + </span>
                      <span style={{ color: 'var(--accent-purple)' }}>{im.toFixed(6)}i</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {Math.sqrt(re*re + im*im) < 1e-8 ? '(zero ✓)' : ''}
                    </div>
                  </div>
                ))}

                <div className="highlight-box" style={{ background: 'rgba(59,130,246,0.06)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Robertson Uncertainty Relation</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    ΔA·ΔB ≥ ½|⟨[Â,B̂]⟩|
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Commutator Definition</div>
              <div className="math-eq">[Â, B̂] = ÂB̂ − B̂Â</div>
              <div className="math-eq" style={{ color: 'var(--text-muted)' }}>Represented as dense N×N matrices (N={N_GRID})</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Operators (Finite Difference)</div>
              <div className="math-eq">x̂: diagonal, (x̂)_ii = xᵢ</div>
              <div className="math-eq">p̂ = -i·Δ/2dx: tridiagonal</div>
              <div className="math-eq">T̂ = -1/(2m)·D²: tridiagonal</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Canonical Pair</div>
              <div className="math-eq">[x̂, p̂] = iħ = i [AU]</div>
              <div className="math-eq">Generates Heisenberg algebra</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Operators</div>
          {[
            { lbl: 'Operator A', val: opA, set: setOpA },
            { lbl: 'Operator B', val: opB, set: setOpB },
          ].map(({ lbl, val, set }) => (
            <div key={lbl} className="control-row">
              <label className="control-label">{lbl}</label>
              <select className="control-select" value={val} onChange={e => set(e.target.value as OperatorId)}>
                <option value="x">x̂ (position)</option>
                <option value="p">p̂ (momentum)</option>
                <option value="T">T̂ (kinetic)</option>
                <option value="H">Ĥ (harmonic)</option>
              </select>
            </div>
          ))}
        </div>

        <div className="control-section">
          <div className="control-section-title">Hamiltonian Params</div>
          {[
            { lbl: 'ω', unit: 'a.u.', val: omega, set: setOmega, step: 0.1, min: 0.1 },
            { lbl: 'm', unit: 'mₑ', val: mass, set: setMass, step: 0.1, min: 0.1 },
          ].map(({ lbl, unit, val, set, step, min }) => (
            <div key={lbl} className="control-row">
              <label className="control-label">{lbl} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={val} onChange={e => set(parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="control-section">
          <div className="control-section-title">Display</div>
          <div className="control-row">
            <label className="control-label">Matrix block size</label>
            <input className="control-input" type="number" step="1" min={2} max={12}
              value={displayN} onChange={e => setDisplayN(parseInt(e.target.value))} />
          </div>
        </div>

        <div className="control-section">
          <div className="control-section-title">Notable Commutators</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { a: 'x' as OperatorId, b: 'p' as OperatorId, label: '[x̂, p̂] = iħ' },
              { a: 'x' as OperatorId, b: 'H' as OperatorId, label: '[x̂, Ĥ] = iħp̂/m' },
              { a: 'p' as OperatorId, b: 'H' as OperatorId, label: '[p̂, Ĥ] = -iħV\'' },
              { a: 'T' as OperatorId, b: 'H' as OperatorId, label: '[T̂, Ĥ] = [T̂,V̂]' },
            ].map(({ a, b, label }) => (
              <button key={label} className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 11 }}
                onClick={() => { setOpA(a); setOpB(b); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
