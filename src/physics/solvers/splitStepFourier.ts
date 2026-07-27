/**
 * Split-Step Fourier Method for the Time-Dependent Schrödinger Equation.
 *
 * iħ ∂ψ/∂t = [-ħ²/(2m) ∂²/∂x² + V(x)] ψ
 *
 * In atomic units (ħ=1, me=1):
 * i ∂ψ/∂t = [-½∂²/∂x² + V(x)] ψ
 *
 * Operator splitting (Strang splitting, 2nd-order):
 *   ψ(x, t+dt) ≈ e^{-iV(x)dt/2} · IFFT[e^{-ik²dt/2m} · FFT[e^{-iV(x)dt/2} ψ]]
 *
 * This is unconditionally stable for conservative potentials.
 */

import { ComplexArray, expI } from '../utils/complex';
import { fft, kFrequencies } from '../utils/fft';

export interface SplitStepConfig {
  N: number;         // Grid points (power of 2, e.g. 1024)
  xMin: number;      // Left boundary [a.u.]
  xMax: number;      // Right boundary [a.u.]
  dt: number;        // Time step [a.u.]
  mass: number;      // Particle mass [a.u.] (1 = electron)
  /** Potential function V(x) [a.u.] */
  V: (x: number) => number;
}

export interface SplitStepState {
  psi: ComplexArray;
  x: Float64Array;
  V: Float64Array;
  t: number;
  step: number;
}

export class SplitStepSolver {
  readonly N: number;
  readonly dx: number;
  readonly dt: number;
  readonly mass: number;
  readonly x: Float64Array;
  readonly V: Float64Array;

  // Precomputed propagators
  private readonly halfV: Float64Array;   // phase: -V*dt/2
  private readonly kProp: Float64Array;   // phase: -k²dt/(2m)

  private psi: ComplexArray;
  private _t: number = 0;
  private _step: number = 0;

  constructor(config: SplitStepConfig, initialPsi: (x: number, i: number) => [number, number]) {
    const { N, xMin, xMax, dt, mass, V } = config;

    if ((N & (N - 1)) !== 0) throw new Error('N must be a power of 2');

    this.N = N;
    this.dx = (xMax - xMin) / N;
    this.dt = dt;
    this.mass = mass;

    // Build spatial grid
    this.x = new Float64Array(N);
    for (let i = 0; i < N; i++) this.x[i] = xMin + i * this.dx;

    // Build potential grid
    this.V = new Float64Array(N);
    for (let i = 0; i < N; i++) this.V[i] = V(this.x[i]);

    // Half-step potential propagator phase angles
    this.halfV = new Float64Array(N);
    for (let i = 0; i < N; i++) this.halfV[i] = -this.V[i] * dt / 2;

    // Kinetic propagator phase angles in k-space
    const k = kFrequencies(N, this.dx);
    this.kProp = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.kProp[i] = -(k[i] * k[i] * dt) / (2 * mass);
    }

    // Initialize wavefunction
    this.psi = new ComplexArray(N, (i) => initialPsi(this.x[i], i));
    // Normalize
    this.psi.normalize(this.dx);
  }

  /** Advance by one time step using Strang splitting */
  step(): void {
    const N = this.N;
    const psi = this.psi;

    // 1. Half-step real-space potential phase
    for (let i = 0; i < N; i++) {
      const [cos, sin] = [Math.cos(this.halfV[i]), Math.sin(this.halfV[i])];
      const r = psi.re(i), im = psi.im(i);
      psi.data[2 * i]     = r * cos - im * sin;
      psi.data[2 * i + 1] = r * sin + im * cos;
    }

    // 2. Forward FFT to k-space
    fft(psi, false);

    // 3. Full-step kinetic phase in k-space
    for (let i = 0; i < N; i++) {
      const [cos, sin] = [Math.cos(this.kProp[i]), Math.sin(this.kProp[i])];
      const r = psi.re(i), im = psi.im(i);
      psi.data[2 * i]     = r * cos - im * sin;
      psi.data[2 * i + 1] = r * sin + im * cos;
    }

    // 4. Inverse FFT back to real space
    fft(psi, true);

    // 5. Second half-step real-space potential phase
    for (let i = 0; i < N; i++) {
      const [cos, sin] = [Math.cos(this.halfV[i]), Math.sin(this.halfV[i])];
      const r = psi.re(i), im = psi.im(i);
      psi.data[2 * i]     = r * cos - im * sin;
      psi.data[2 * i + 1] = r * sin + im * cos;
    }

    this._t += this.dt;
    this._step++;
  }

  /** Advance by nSteps */
  advance(nSteps: number): void {
    for (let i = 0; i < nSteps; i++) this.step();
  }

  get t(): number { return this._t; }
  get stepCount(): number { return this._step; }
  get state(): ComplexArray { return this.psi; }

  /** Current normalization (should stay ≈ 1) */
  normalization(): number { return this.psi.norm2(this.dx); }

  /** CFL stability check for split-step method */
  static checkStability(dx: number, dt: number, mass: number, Vmax: number): { stable: boolean; reason?: string } {
    // Kinetic: dt·π²/(2m·dx²) should be order 1 or less for accuracy
    const kineticPhase = (Math.PI * Math.PI * dt) / (2 * mass * dx * dx);
    if (kineticPhase > 10) {
      return { stable: false, reason: `Kinetic phase = ${kineticPhase.toFixed(2)} (dt too large or dx too small)` };
    }
    const potPhase = Math.abs(Vmax) * dt;
    if (potPhase > 10) {
      return { stable: false, reason: `Potential phase = ${potPhase.toFixed(2)} (V too large or dt too large)` };
    }
    return { stable: true };
  }

  /** Update potential (for interactive changes) */
  updatePotential(V: (x: number) => number): void {
    for (let i = 0; i < this.N; i++) {
      this.V[i] = V(this.x[i]);
      this.halfV[i] = -this.V[i] * this.dt / 2;
    }
  }
}

/**
 * Create a Gaussian wave packet initial state.
 * ψ(x) = (2πσ²)^{-1/4} exp[-(x-x₀)²/(4σ²)] exp[ik₀(x-x₀)]
 *
 * @param x0     Center position [a.u.]
 * @param sigma  Spatial width (standard deviation) [a.u.]
 * @param k0     Central wave vector [a.u.]
 */
export function gaussianWavePacket(x0: number, sigma: number, k0: number) {
  return (x: number): [number, number] => {
    const norm = Math.pow(2 * Math.PI * sigma * sigma, -0.25);
    const gauss = norm * Math.exp(-(x - x0) * (x - x0) / (4 * sigma * sigma));
    const phase = k0 * (x - x0);
    return [gauss * Math.cos(phase), gauss * Math.sin(phase)];
  };
}
