/**
 * Module 3: Particle in a Box (Infinite Square Well)
 *
 * Exact analytical solutions:
 *   ψₙ(x) = √(2/L) sin(nπx/L),  x ∈ [0, L]
 *   Eₙ = n²π²ħ²/(2mL²)          [a.u.: Eₙ = n²π²/(2mL²)]
 *
 * Supports superposition states, orthogonality verification, and time evolution.
 */

import { ComplexArray } from '../utils/complex';
import { innerProduct, computeObservables } from '../utils/expectation';

export interface BoxParams {
  L: number;       // Box length [a.u.]
  mass: number;    // Particle mass [a.u.]
  N: number;       // Grid points
  nMax: number;    // Maximum quantum number to display (1-based)
}

export interface BoxState {
  /** Quantum number n (1-based) */
  n: number;
  energy: number;         // Eₙ [a.u.]
  psi: Float64Array;      // ψₙ(x)
  probDensity: Float64Array; // |ψₙ|²
  nodes: number[];        // x positions of nodes (excluding boundaries)
  xExp: number;           // ⟨x⟩ = L/2 for all n
  x2Exp: number;          // ⟨x²⟩
  deltaX: number;         // Δx
  pExp: number;           // ⟨p⟩ = 0 for stationary states
  p2Exp: number;          // ⟨p²⟩ = 2mEₙ
  deltaP: number;         // Δp
  deltaXDeltaP: number;   // Δx·Δp ≥ ħ/2
}

export interface BoxResult {
  x: Float64Array;
  dx: number;
  L: number;
  states: BoxState[];
  orthogonalityMatrix: number[][];  // Re(⟨m|n⟩) — should be δₘₙ
  /** Exact energies Eₙ = n²E₁ */
  energySpectrum: Float64Array;
}

/** Exact eigenstate for particle in box */
export function boxEigenstate(n: number, L: number, N: number): {
  x: Float64Array; psi: Float64Array; energy: number; dx: number
} {
  const dx = L / (N - 1);
  const x = new Float64Array(N);
  const psi = new Float64Array(N);
  const A = Math.sqrt(2 / L);

  for (let i = 0; i < N; i++) {
    x[i] = i * dx;
    psi[i] = A * Math.sin(n * Math.PI * x[i] / L);
  }

  // In atomic units: Eₙ = n²π²/(2mL²) with m=1 by default
  const energy = n * n * Math.PI * Math.PI / (2 * L * L);

  return { x, psi, energy, dx };
}

/** Exact energy formula */
export function boxEnergy(n: number, L: number, mass: number): number {
  return (n * n * Math.PI * Math.PI) / (2 * mass * L * L);
}

/** Solve all states up to nMax */
export function solveParticleInBox(params: BoxParams): BoxResult {
  const { L, mass, N, nMax } = params;
  const dx = L / (N - 1);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = i * dx;

  const states: BoxState[] = [];
  const energySpectrum = new Float64Array(nMax);

  for (let n = 1; n <= nMax; n++) {
    const En = boxEnergy(n, L, mass);
    energySpectrum[n - 1] = En;

    const A = Math.sqrt(2 / L);
    const psi = new Float64Array(N);
    const probDensity = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      psi[i] = A * Math.sin(n * Math.PI * x[i] / L);
      probDensity[i] = psi[i] * psi[i];
    }

    // Nodes: at x = kL/n for k=1..n-1 (internal nodes only)
    const nodes: number[] = [];
    for (let k = 1; k < n; k++) nodes.push((k * L) / n);

    // ⟨x⟩ = L/2 (by symmetry)
    const xExp = L / 2;

    // ⟨x²⟩ = L²/3 - L²/(2n²π²)
    const x2Exp = L * L / 3 - L * L / (2 * n * n * Math.PI * Math.PI);

    const varX = x2Exp - xExp * xExp;
    const deltaX = Math.sqrt(Math.max(0, varX));

    // ⟨p⟩ = 0 for stationary states (real wavefunction)
    const pExp = 0;

    // ⟨p²⟩ = 2mEₙ = n²π²/L² (AU, m=1)
    const p2Exp = n * n * Math.PI * Math.PI / (L * L);

    const deltaP = Math.sqrt(p2Exp);
    const deltaXDeltaP = deltaX * deltaP;

    states.push({ n, energy: En, psi, probDensity, nodes, xExp, x2Exp, deltaX, pExp, p2Exp, deltaP, deltaXDeltaP });
  }

  // Orthogonality matrix: ⟨m|n⟩ = δₘₙ
  const orthogonalityMatrix: number[][] = [];
  for (let m = 0; m < nMax; m++) {
    orthogonalityMatrix[m] = [];
    const psiMArr = new ComplexArray(N, (i) => [states[m].psi[i], 0]);
    for (let n = 0; n < nMax; n++) {
      const psiNArr = new ComplexArray(N, (i) => [states[n].psi[i], 0]);
      const [r] = innerProduct(psiMArr, psiNArr, dx);
      orthogonalityMatrix[m][n] = r;
    }
  }

  return { x, dx, L, states, orthogonalityMatrix, energySpectrum };
}

/**
 * Time-evolve a superposition state.
 * ψ(x,t) = Σ cₙ ψₙ(x) e^{-iEₙt}
 *
 * @param coeffs  Expansion coefficients cₙ (complex: [re, im]) for n=1..N
 * @param states  Precomputed box states
 * @param t       Time [a.u.]
 * @param N       Grid size
 */
export function evolveBoxSuperposition(
  coeffs: [number, number][],
  states: BoxState[],
  t: number,
  N: number
): ComplexArray {
  const psi = new ComplexArray(N);

  for (let ni = 0; ni < coeffs.length && ni < states.length; ni++) {
    const [cr, ci] = coeffs[ni];
    const E = states[ni].energy;
    const phase = -E * t;
    const cosP = Math.cos(phase), sinP = Math.sin(phase);

    // c_n * e^{-iEnt}
    const ampRe = cr * cosP - ci * sinP;
    const ampIm = cr * sinP + ci * cosP;

    for (let i = 0; i < N; i++) {
      const pnr = states[ni].psi[i];
      psi.data[2 * i]     += ampRe * pnr;
      psi.data[2 * i + 1] += ampIm * pnr;
    }
  }

  return psi;
}
