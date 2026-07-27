import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import './index.css';

// Lazy-loaded modules for optimized bundle splitting & fast load
const SchrodingerModule = lazy(() => import('./components/modules/SchrodingerModule'));
const TunnellingModule = lazy(() => import('./components/modules/TunnellingModule'));
const ParticleInBoxModule = lazy(() => import('./components/modules/ParticleInBoxModule'));
const HarmonicOscillatorModule = lazy(() => import('./components/modules/HarmonicOscillatorModule'));
const DoubleSlitModule = lazy(() => import('./components/modules/DoubleSlitModule'));
const HydrogenAtomModule = lazy(() => import('./components/modules/HydrogenAtomModule'));
const UncertaintyModule = lazy(() => import('./components/modules/UncertaintyModule'));
const OperatorAlgebraModule = lazy(() => import('./components/modules/OperatorAlgebraModule'));
const QuantumMeasurementModule = lazy(() => import('./components/modules/QuantumMeasurementModule'));

export type ModuleId =
  | 'schrodinger'
  | 'tunnelling'
  | 'particle-in-box'
  | 'harmonic-oscillator'
  | 'double-slit'
  | 'hydrogen-atom'
  | 'uncertainty'
  | 'operator-algebra'
  | 'measurement';

const MODULES: { id: ModuleId; label: string; icon: string; num: string }[] = [
  { id: 'schrodinger',          label: 'Schrödinger Eq.',   icon: 'ψ', num: '01' },
  { id: 'tunnelling',           label: 'Quantum Tunnelling', icon: '⊡', num: '02' },
  { id: 'particle-in-box',      label: 'Particle In A Box', icon: '□', num: '03' },
  { id: 'harmonic-oscillator',  label: 'Harmonic Oscillator',icon: '∿', num: '04' },
  { id: 'double-slit',          label: 'Double Slit',        icon: '⊕', num: '05' },
  { id: 'hydrogen-atom',        label: 'Hydrogen Atom',      icon: '⚛', num: '06' },
  { id: 'uncertainty',          label: 'Uncertainty',        icon: 'Δ', num: '07' },
  { id: 'operator-algebra',     label: 'Operator Algebra',   icon: 'Â', num: '08' },
  { id: 'measurement',          label: 'Measurement',        icon: '◎', num: '09' },
];

const MODULE_COMPONENTS: Record<ModuleId, React.ComponentType> = {
  'schrodinger':         SchrodingerModule,
  'tunnelling':          TunnellingModule,
  'particle-in-box':     ParticleInBoxModule,
  'harmonic-oscillator': HarmonicOscillatorModule,
  'double-slit':         DoubleSlitModule,
  'hydrogen-atom':       HydrogenAtomModule,
  'uncertainty':         UncertaintyModule,
  'operator-algebra':    OperatorAlgebraModule,
  'measurement':         QuantumMeasurementModule,
};

const STORAGE_KEY = 'quantumlab_settings';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return saved.activeModule || 'schrodinger';
    } catch { return 'schrodinger'; }
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return saved.theme || 'dark';
    } catch { return 'dark'; }
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeModule, theme }));
    document.documentElement.setAttribute('data-theme', theme);
  }, [activeModule, theme]);

  // Keyboard shortcuts: 1-9 to select modules
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      setActiveModule(MODULES[num - 1].id);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const ActiveModuleComponent = MODULE_COMPONENTS[activeModule];

  return (
    <div className="app" data-theme={theme}>
      {/* TopBar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">ψ</div>
          <span>Quantum<span className="accent">Lab</span></span>
        </div>
        <span className="topbar-badge">Atomic Units</span>
        <span className="topbar-badge" style={{ background: 'rgba(20,184,166,0.1)', color: 'var(--accent-teal)', borderColor: 'rgba(20,184,166,0.25)' }}>
          CODATA 2018
        </span>
        <div className="topbar-spacer" />
        <button
          className="topbar-btn"
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          title="Toggle theme (keyboard: 1-9 for modules)"
        >
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-section-label">Modules</div>
        {MODULES.map(m => (
          <div
            key={m.id}
            className={`sidebar-item ${activeModule === m.id ? 'active' : ''}`}
            onClick={() => setActiveModule(m.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setActiveModule(m.id)}
            aria-label={m.label}
          >
            <span className="sidebar-item-icon">{m.icon}</span>
            <span className="sidebar-item-label">{m.label}</span>
            <span className="sidebar-item-num">{m.num}</span>
          </div>
        ))}
        <div className="sidebar-footer">
          ħ = 1.0546×10⁻³⁴ J·s<br />
          mₑ = 9.1094×10⁻³¹ kg<br />
          a₀ = 5.2918×10⁻¹¹ m
          <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '9.5px' }}>
            Press 1–9 to switch modules
          </div>
        </div>
      </nav>

      {/* Main Content with Suspense */}
      <main className="main-content">
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 10 }}>
            <div className="spinner" /> Loading module...
          </div>
        }>
          <ActiveModuleComponent />
        </Suspense>
      </main>
    </div>
  );
}
