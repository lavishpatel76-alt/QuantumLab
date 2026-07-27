/**
 * Expectation values and statistical moments for quantum states.
 * All computations in atomic units (ħ=1, me=1, a₀=1).
 */

import { ComplexArray } from './complex';
import { fft, kFrequencies } from './fft';

export interface Observables {
  normSquared: number;   // ∫|ψ|² dx (should be ≈ 1)
  xExp: number;          // ⟨x⟩
  x2Exp: number;         // ⟨x²⟩
  deltaX: number;        // Δx = √(⟨x²⟩ - ⟨x⟩²)
  pExp: number;          // ⟨p⟩
  p2Exp: number;         // ⟨p²⟩
  deltaP: number;        // Δp = √(⟨p²⟩ - ⟨p⟩²)
  deltaXDeltaP: number;  // Δx·Δp (should be ≥ ħ/2 = 0.5 in AU)
  energyKinetic: number; // ⟨T⟩ = ⟨p²⟩/(2m) in AU
  normalizationError: number; // |1 - ∫|ψ|²dx|
}

/**
 * Compute all observables for a 1D wavefunction ψ on a uniform grid.
 *
 * @param psi  ComplexArray of length N
 * @param x    Float64Array of position grid [a.u.]
 * @param dx   Grid spacing [a.u.]
 * @param m    Particle mass [a.u.] (default 1 = electron)
 */
export function computeObservables(
  psi: ComplexArray,
  x: Float64Array,
  dx: number,
  m: number = 1
): Observables {
  const N = psi.length;

  // Position moments via quadrature
  let norm2 = 0;
  let xExp = 0;
  let x2Exp = 0;

  for (let i = 0; i < N; i++) {
    const p = psi.abs2(i);
    norm2 += p;
    xExp  += p * x[i];
    x2Exp += p * x[i] * x[i];
  }
  norm2 *= dx;
  xExp  *= dx;
  x2Exp *= dx;

  const varX = x2Exp - xExp * xExp;
  const deltaX = Math.sqrt(Math.max(0, varX));

  // Momentum moments via FFT
  // p̂ψ in momentum space: ψ̃(k) = FFT(ψ), p = ħk (AU: p = k)
  const psiK = psi.clone();
  fft(psiK, false);

  const kArr = kFrequencies(N, dx);
  const dkTotal = (2 * Math.PI) / (N * dx);

  let pExp = 0;
  let p2Exp = 0;

  for (let i = 0; i < N; i++) {
    const pk = psiK.abs2(i) / N; // |ψ̃(k)|² normalized by N (from FFT convention)
    pExp  += pk * kArr[i];
    p2Exp += pk * kArr[i] * kArr[i];
  }
  // Parseval factor: ∫|ψ̃|²dk/2π = ∫|ψ|²dx
  const parseval = dkTotal / (2 * Math.PI);
  pExp  *= parseval;
  p2Exp *= parseval;

  const varP = p2Exp - pExp * pExp;
  const deltaP = Math.sqrt(Math.max(0, varP));

  return {
    normSquared: norm2,
    xExp,
    x2Exp,
    deltaX,
    pExp,
    p2Exp,
    deltaP,
    deltaXDeltaP: deltaX * deltaP,
    energyKinetic: p2Exp / (2 * m),
    normalizationError: Math.abs(1 - norm2),
  };
}

/**
 * Compute potential energy expectation value ⟨V⟩ = ∫|ψ|²V dx
 */
export function expectationV(psi: ComplexArray, V: Float64Array, dx: number): number {
  let vExp = 0;
  for (let i = 0; i < psi.length; i++) {
    vExp += psi.abs2(i) * V[i];
  }
  return vExp * dx;
}

/**
 * Compute orthogonality integral ⟨ψₘ|ψₙ⟩ for two states.
 * Returns [re, im] of the inner product.
 */
export function innerProduct(
  psiM: ComplexArray,
  psiN: ComplexArray,
  dx: number
): [number, number] {
  let re = 0, im = 0;
  for (let i = 0; i < psiM.length; i++) {
    // ⟨m|n⟩ = ∫ ψm* ψn dx
    const mr = psiM.re(i), mi = psiM.im(i);
    const nr = psiN.re(i), ni = psiN.im(i);
    re += mr * nr + mi * ni;   // Re(m* n) = mr*nr + mi*ni
    im += mr * ni - mi * nr;   // Im(m* n) = mr*ni - mi*nr
  }
  return [re * dx, im * dx];
}
