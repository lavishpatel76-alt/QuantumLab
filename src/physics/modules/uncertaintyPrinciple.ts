/**
 * Module 7: Heisenberg Uncertainty Principle
 *
 * Numerically demonstrates ΔxΔp ≥ ħ/2 = 0.5 [a.u.]
 * by evolving Gaussian wave packets of varying localization.
 */

import { ComplexArray } from '../utils/complex';
import { computeObservables, Observables } from '../utils/expectation';
import { SplitStepSolver, gaussianWavePacket } from '../solvers/splitStepFourier';
import { fft, kFrequencies, fftShift } from '../utils/fft';

export interface UncertaintyParams {
  sigma: number;     // Initial spatial width [a.u.]
  k0: number;        // Central wave vector [a.u.]
  x0: number;        // Initial center [a.u.]
  N: number;         // Grid points
  xMin: number;
  xMax: number;
  dt: number;
  mass: number;
}

export interface UncertaintySnapshot {
  t: number;
  obs: Observables;
  /** Momentum space distribution |ψ̃(k)|² */
  kGrid: Float64Array;
  momentumDensity: Float64Array;
  psi: ComplexArray;
  /** Analytical spreading: σ(t) = σ₀√(1 + (ħt/2mσ₀²)²) = σ₀√(1 + (t/2σ₀²)²) in AU */
  analyticalSigmaX: number;
  analyticalDeltaP: number;   // ħ/(2σ₀) = 1/(2σ₀) in AU — constant
  /** |ΔxΔp - ħ/2| / (ħ/2) — fractional deviation from minimum */
  uncertaintyExcess: number;
}

export class UncertaintySimulation {
  private solver: SplitStepSolver;
  readonly params: UncertaintyParams;
  private readonly kGrid: Float64Array;
  private readonly sigma0: number;

  constructor(params: UncertaintyParams) {
    this.params = params;
    this.sigma0 = params.sigma;

    this.solver = new SplitStepSolver(
      { N: params.N, xMin: params.xMin, xMax: params.xMax, dt: params.dt, mass: params.mass, V: () => 0 },
      gaussianWavePacket(params.x0, params.sigma, params.k0)
    );

    this.kGrid = kFrequencies(params.N, (params.xMax - params.xMin) / params.N);
  }

  getSnapshot(): UncertaintySnapshot {
    const { x, dx, dt: _, t, mass } = this.solver;
    const psi = this.solver.state.clone();
    const obs = computeObservables(psi, x, dx, mass);

    // Momentum density via FFT
    const psiK = psi.clone();
    fft(psiK, false);
    const N = psiK.length;
    const dk = (2 * Math.PI) / (N * dx);

    // FFT-shift for display
    const shiftedK = fftShift(psiK);
    const kShifted = new Float64Array(N);
    const momDensity = new Float64Array(N);
    let totalMom = 0;
    for (let i = 0; i < N; i++) {
      kShifted[i] = (i - N / 2) * dk;
      momDensity[i] = shiftedK.abs2(i) / N;
      totalMom += momDensity[i];
    }
    // Normalize momentum density
    for (let i = 0; i < N; i++) momDensity[i] /= (totalMom * dk || 1);

    // Analytical formulas for free Gaussian:
    // σ(t) = σ₀ √(1 + (t/(2mσ₀²))²)  [AU: m=1 by default, ħ=1]
    const tau = this.solver.t / (2 * mass * this.sigma0 * this.sigma0);
    const analyticalSigmaX = this.sigma0 * Math.sqrt(1 + tau * tau);
    const analyticalDeltaP = 1 / (2 * this.sigma0); // ΔxΔp = ħ/2 → Δp = ħ/(2σ₀) = 1/(2σ₀) AU

    // Heisenberg bound check
    const hbar_over_2 = 0.5; // AU
    const uncertaintyExcess = (obs.deltaXDeltaP - hbar_over_2) / hbar_over_2;

    return {
      t: this.solver.t,
      obs,
      kGrid: kShifted,
      momentumDensity: momDensity,
      psi,
      analyticalSigmaX,
      analyticalDeltaP,
      uncertaintyExcess,
    };
  }

  advance(nSteps: number): UncertaintySnapshot {
    this.solver.advance(nSteps);
    return this.getSnapshot();
  }

  reset(): void {
    this.solver = new SplitStepSolver(
      { N: this.params.N, xMin: this.params.xMin, xMax: this.params.xMax, dt: this.params.dt, mass: this.params.mass, V: () => 0 },
      gaussianWavePacket(this.params.x0, this.params.sigma, this.params.k0)
    );
  }
}
