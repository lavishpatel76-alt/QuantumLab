import { useState, useEffect, useMemo } from 'react';
import { solveDoubleSlit, DoubleSlitParams, DoubleSlitResult } from '../../physics/modules/doubleSlit';
import CanvasPlot from '../charts/CanvasPlot';
import Heatmap2D from '../charts/Heatmap2D';

export default function DoubleSlitModule() {
  const [wavelength, setWavelength] = useState(10.0);
  const [slitWidth, setSlitWidth] = useState(3.0);
  const [slitSep, setSlitSep] = useState(12.0);
  const [detectorDist, setDetectorDist] = useState(80.0);
  const [screenWidth, setScreenWidth] = useState(120.0);
  const [plotView, setPlotView] = useState<'detector' | 'propagation' | 'aperture'>('detector');
  const [result, setResult] = useState<DoubleSlitResult | null>(null);
  const [computing, setComputing] = useState(false);

  const params: DoubleSlitParams = useMemo(() => ({
    wavelength,
    slitWidth,
    slitSeparation: slitSep,
    detectorDistance: detectorDist,
    screenWidth,
    N: 512,
    Nz: 64,
    compute2DMap: plotView === 'propagation',
  }), [wavelength, slitWidth, slitSep, detectorDist, screenWidth, plotView]);

  useEffect(() => {
    setComputing(true);
    // Run in next tick to allow UI update
    const id = setTimeout(() => {
      try {
        const res = solveDoubleSlit(params);
        setResult(res);
      } catch (e) {
        console.error(e);
      }
      setComputing(false);
    }, 10);
    return () => clearTimeout(id);
  }, [params]);

  const analyticalSpacing = result?.analyticalFringeSpacing ?? 0;
  const numericalSpacing = result?.numericalFringeSpacing;
  const spacingError = numericalSpacing ? Math.abs(numericalSpacing - analyticalSpacing) / analyticalSpacing : null;

  return (
    <div className="module-container">
      <div className="canvas-area">
        {/* Tabs */}
        <div className="module-tabs" style={{ background: 'var(--bg-surface)', padding: '6px 10px 0', border: '1px solid var(--border-subtle)', borderBottom: 'none', borderRadius: 'var(--panel-radius) var(--panel-radius) 0 0' }}>
          {(['detector', 'propagation', 'aperture'] as const).map(t => (
            <div key={t} className={`module-tab ${plotView === t ? 'active' : ''}`} onClick={() => setPlotView(t)}>
              {t === 'detector' ? 'Detector Plane' : t === 'propagation' ? '2D Propagation' : 'Aperture'}
            </div>
          ))}
          {computing && <div className="spinner" style={{ marginLeft: 'auto', marginTop: 4 }} />}
        </div>

        {/* Main plot */}
        <div className="canvas-panel" style={{ flex: 2, borderRadius: '0 var(--panel-radius) var(--panel-radius) var(--panel-radius)' }}>
          <div className="canvas-panel-header">
            <span className="canvas-panel-title">
              {plotView === 'detector' ? 'Intensity Distribution I(x) at Detector' :
               plotView === 'propagation' ? '2D Wave Propagation Map' : 'Aperture Transmission'}
            </span>
            <span className="canvas-panel-badge badge-blue" style={{ marginLeft: 'auto' }}>
              λ = {wavelength.toFixed(1)} a.u.
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
            {plotView === 'detector' && result && (
              <CanvasPlot config={{
                lines: [
                  { data: result.intensity, color: 'var(--accent-teal)', label: 'I(x)', lineWidth: 1.8 },
                  // Single-slit envelope
                  {
                    data: (() => {
                      const a = slitWidth / 2;
                      return Array.from(result.detectorX).map(xi => {
                        const arg = Math.PI * a * xi / (wavelength * detectorDist);
                        const sinc = Math.abs(arg) < 1e-10 ? 1 : Math.sin(arg) / arg;
                        return sinc * sinc;
                      });
                    })(),
                    color: 'var(--accent-amber)',
                    label: 'sinc² envelope',
                    lineWidth: 1,
                    dashed: true,
                  },
                ],
                xData: result.detectorX,
                xLabel: 'x [a.u.]',
                yLabel: 'Intensity [a.u.⁻¹]',
                hLines: [{ y: 0, color: 'var(--border-default)', dashed: false }],
              }} />
            )}

            {plotView === 'propagation' && result && (
              <div style={{ height: '100%', position: 'relative' }}>
                <Heatmap2D
                  data={result.intensityMap2D}
                  nx={params.N}
                  ny={params.Nz}
                  xLabel="x (transverse) [a.u.]"
                  yLabel="z (propagation) [a.u.]"
                  colormap="magma"
                  xRange={[-screenWidth / 2, screenWidth / 2]}
                />
                <div style={{ position: 'absolute', bottom: 24, right: 8, fontSize: 10, color: 'rgba(200,200,200,0.7)' }}>
                  z: 0 → {detectorDist.toFixed(0)} a.u.
                </div>
              </div>
            )}

            {plotView === 'aperture' && result && (
              <CanvasPlot config={{
                lines: [
                  { data: result.apertureMask, color: 'var(--accent-primary)', label: 'Aperture T(x)', lineWidth: 2 },
                ],
                xData: result.apertureX,
                xLabel: 'x [a.u.]',
                yLabel: 'Transmission',
                yMin: -0.1,
                yMax: 1.2,
              }} />
            )}
          </div>
        </div>

        {/* Fringe analysis */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--panel-radius)', padding: '10px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            {[
              { label: 'Fringe spacing (analytic)', val: analyticalSpacing.toFixed(4) + ' a.u.', note: 'Δy = λL/d' },
              { label: 'Fringe spacing (numerical)', val: numericalSpacing ? numericalSpacing.toFixed(4) + ' a.u.' : '—' },
              { label: 'Relative error', val: spacingError != null ? spacingError.toExponential(3) : '—', cls: spacingError != null ? (spacingError < 0.01 ? 'good' : 'warn') : '' },
              { label: 'Normalization error', val: result?.normalizationError.toExponential(3) ?? '—', cls: (result?.normalizationError ?? 1) < 0.01 ? 'good' : 'warn' },
            ].map(({ label, val, note, cls }) => (
              <div key={label} className="obs-item">
                <div className="obs-label">{label}</div>
                <div className={`obs-value ${cls ?? ''}`}>{val}</div>
                {note && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{note}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Math panel */}
        <div className="math-panel" style={{ borderRadius: 'var(--panel-radius)', border: '1px solid var(--border-subtle)' }}>
          <div className="math-panel-content">
            <div className="math-block">
              <div className="math-block-label">Angular Spectrum Method</div>
              <div className="math-eq">U(x,z) = F⁻¹[ F[U(x,0)] · exp(i·kz·z) ]</div>
              <div className="math-eq">kz = √(k₀² - kx²),  k₀ = 2π/λ</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Fringe Spacing (paraxial)</div>
              <div className="math-eq">Δy = λL/d = {wavelength.toFixed(2)}×{detectorDist.toFixed(1)}/{slitSep.toFixed(1)}</div>
              <div className="math-eq" style={{ color: 'var(--accent-teal)' }}>= {analyticalSpacing.toFixed(4)} a.u.</div>
            </div>
            <div className="math-block">
              <div className="math-block-label">Single-Slit Envelope</div>
              <div className="math-eq">I_env(θ) = sinc²(πa·sinθ/λ)</div>
              <div className="math-eq" style={{ color: 'var(--text-muted)' }}>a = slit half-width = {(slitWidth/2).toFixed(2)} a.u.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="control-panel">
        <div className="control-section">
          <div className="control-section-title">Wave Parameters</div>
          {[
            { lbl: 'Wavelength λ', unit: 'a.u.', val: wavelength, set: setWavelength, step: 0.5, min: 0.1 },
          ].map(({ lbl, unit, val, set, step, min }) => (
            <div key={lbl} className="control-row">
              <label className="control-label">{lbl} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={val} onChange={e => set(parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="control-section">
          <div className="control-section-title">Slit Geometry</div>
          {[
            { lbl: 'Slit width a', unit: 'a.u.', val: slitWidth, set: setSlitWidth, step: 0.5, min: 0.1 },
            { lbl: 'Slit separation d', unit: 'a.u.', val: slitSep, set: setSlitSep, step: 1, min: 0.5 },
          ].map(({ lbl, unit, val, set, step, min }) => (
            <div key={lbl} className="control-row">
              <label className="control-label">{lbl} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={val} onChange={e => set(parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="control-section">
          <div className="control-section-title">Screen</div>
          {[
            { lbl: 'Detector distance L', unit: 'a.u.', val: detectorDist, set: setDetectorDist, step: 10, min: 1 },
            { lbl: 'Screen width W', unit: 'a.u.', val: screenWidth, set: setScreenWidth, step: 10, min: 10 },
          ].map(({ lbl, unit, val, set, step, min }) => (
            <div key={lbl} className="control-row">
              <label className="control-label">{lbl} <span className="control-unit">{unit}</span></label>
              <input className="control-input" type="number" step={step} min={min}
                value={val} onChange={e => set(parseFloat(e.target.value))} />
            </div>
          ))}
        </div>

        {/* Quick combos */}
        <div className="control-section">
          <div className="control-section-title">Presets</div>
          {[
            { label: 'Diffraction-limited', lambda: 10, a: 3, d: 12, L: 80 },
            { label: 'Wide slits', lambda: 10, a: 6, d: 20, L: 100 },
            { label: 'Narrow slits', lambda: 10, a: 1.5, d: 8, L: 80 },
          ].map(p => (
            <button key={p.label} className="btn btn-ghost" style={{ width: '100%', marginBottom: 4, justifyContent: 'flex-start' }}
              onClick={() => { setWavelength(p.lambda); setSlitWidth(p.a); setSlitSep(p.d); setDetectorDist(p.L); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
