/**
 * Module 1: Time-Dependent Schrödinger Equation
 * Combines Split-Step Fourier solver with potential definitions and wave packet initialization.
 */

import { SplitStepSolver, gaussianWavePacket, SplitStepConfig } from '../solvers/splitStepFourier';
import { computeObservables, expectationV, Observables } from '../utils/expectation';

export type PotentialType = 'free' | 'infinite_well' | 'finite_well' | 'harmonic' | 'custom';

export interface SchrodingerParams {
  potentialType: PotentialType;
  N: number;           // Grid points (512, 1024, 2048)
  xMin: number;        // [a.u.]
  xMax: number;        // [a.u.]
  dt: number;          // [a.u.]
  mass: number;        // [a.u.]
  // Wave packet
  x0: number;          // Initial center [a.u.]
  sigma: number;       // Initial width [a.u.]
  k0: number;          // Initial k [a.u.]
  // Potential params
  wellDepth?: number;  // V₀ for finite well [a.u.]
  wellWidth?: number;  // Width for wells [a.u.]
  omega?: number;      // Angular frequency for harmonic [a.u.]
  customExpr?: string; // Mathematical expression in x
}

export interface SchrodingerResult {
  x: Float64Array;
  psiRe: Float64Array;
  psiIm: Float64Array;
  probDensity: Float64Array;
  phase: Float64Array;
  V: Float64Array;
  obs: Observables;
  t: number;
  step: number;
  normalization: number;
  energyTotal: number;
}

/** Build potential function from type and parameters */
export function buildPotential(params: SchrodingerParams): (x: number) => number {
  const { potentialType, xMin, xMax, wellDepth = 10, wellWidth = 5, omega = 1 } = params;
  const center = (xMin + xMax) / 2;

  switch (potentialType) {
    case 'free':
      return () => 0;

    case 'infinite_well':
      // Represent infinite walls with very high finite potential
      return (x: number) => {
        const inside = x >= center - wellWidth / 2 && x <= center + wellWidth / 2;
        return inside ? 0 : 1e6;
      };

    case 'finite_well':
      return (x: number) => {
        const inside = x >= center - wellWidth / 2 && x <= center + wellWidth / 2;
        return inside ? -Math.abs(wellDepth) : 0;
      };

    case 'harmonic':
      // V(x) = ½mω²x² with center at box center
      return (x: number) => 0.5 * params.mass * omega * omega * (x - center) * (x - center);

    case 'custom':
      // Safe evaluation using Function constructor with limited scope
      try {
        const fn = new Function('x', 'm', 'omega', `"use strict"; return ${params.customExpr ?? '0'};`);
        return (x: number) => {
          try { return fn(x, params.mass, params.omega ?? 1); }
          catch { return 0; }
        };
      } catch {
        return () => 0;
      }
  }
}

/** High-level TDSE simulation manager */
export class SchrodingerSimulation {
  private solver: SplitStepSolver;
  readonly params: SchrodingerParams;

  constructor(params: SchrodingerParams) {
    this.params = params;
    const Vfn = buildPotential(params);

    const config: SplitStepConfig = {
      N: params.N,
      xMin: params.xMin,
      xMax: params.xMax,
      dt: params.dt,
      mass: params.mass,
      V: Vfn,
    };

    const initPsi = gaussianWavePacket(params.x0, params.sigma, params.k0);
    this.solver = new SplitStepSolver(config, initPsi);
  }

  /** Advance by nSteps and return current state */
  advance(nSteps: number): SchrodingerResult {
    this.solver.advance(nSteps);
    return this.getState();
  }

  getState(): SchrodingerResult {
    const { x, V, dx } = this.solver;
    const psi = this.solver.state;
    const obs = computeObservables(psi, x, dx, this.params.mass);
    const vExp = expectationV(psi, V, dx);

    return {
      x: Float64Array.from(x),
      psiRe: psi.toReArray(),
      psiIm: psi.toImArray(),
      probDensity: psi.toProbabilityDensity(),
      phase: psi.toPhaseArray(),
      V: Float64Array.from(V),
      obs,
      t: this.solver.t,
      step: this.solver.stepCount,
      normalization: obs.normSquared,
      energyTotal: obs.energyKinetic + vExp,
    };
  }

  /** Check stability of current parameters */
  checkStability(): { stable: boolean; reason?: string } {
    const Vmax = Math.max(...this.solver.V);
    return SplitStepSolver.checkStability(
      this.solver.dx,
      this.solver.dt,
      this.solver.mass,
      Vmax
    );
  }

  reset(): void {
    const Vfn = buildPotential(this.params);
    const config: SplitStepConfig = {
      N: this.params.N,
      xMin: this.params.xMin,
      xMax: this.params.xMax,
      dt: this.params.dt,
      mass: this.params.mass,
      V: Vfn,
    };
    const initPsi = gaussianWavePacket(this.params.x0, this.params.sigma, this.params.k0);
    this.solver = new SplitStepSolver(config, initPsi);
  }
}
