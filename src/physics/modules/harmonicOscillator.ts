/**
 * Module 4: Quantum Harmonic Oscillator
 *
 * Exact analytical solutions using Hermite polynomials:
 *   ψₙ(x) = (mω/πħ)^{1/4} / √(2ⁿn!) · Hₙ(ξ) · e^{-ξ²/2}
 *   where ξ = √(mω/ħ) · x
 *   Eₙ = ħω(n + ½)
 *
 * In atomic units (ħ=1, me=1):
 *   ξ = √ω · x (with m=1)
 *   Eₙ = ω(n + ½)
 */

import { ComplexArray } from '../utils/complex';
import { fdmEigensolve } from '../solvers/eigenvalue';

export interface HarmonicParams {
  omega: number;   // Angular frequency [a.u.]
  mass: number;    // [a.u.]
  N: number;       // Grid points
  xRange: number;  // Half-range [a.u.]: grid from -xRange to +xRange
  nMax: number;    // Number of states to compute
}

export interface HarmonicState {
  n: number;
  energy: number;         // Eₙ = ω(n+½) [a.u.]
  energyAnalytical: number;
  psi: Float64Array;      // ψₙ(x) analytical
  psiFDM?: Float64Array;  // ψₙ(x) from FDM (for validation)
  probDensity: Float64Array;
  nodes: number[];        // n internal nodes
  xExp: number;           // ⟨x⟩ = 0 for stationary states
  x2Exp: number;          // ⟨x²⟩ = (n+½)/ω
  deltaX: number;         // √(⟨x²⟩) = √((n+½)/ω)
  p2Exp: number;          // ⟨p²⟩ = mω(n+½) = ω(n+½) in AU
  deltaP: number;
  deltaXDeltaP: number;   // (n+½) [a.u.] ≥ ½
}

export interface HarmonicResult {
  x: Float64Array;
  dx: number;
  omega: number;
  states: HarmonicState[];
  energySpectrum: Float64Array;
  fdmComparison?: {
    eigenvaluesFDM: Float64Array;
    eigenvalueAnalytical: Float64Array;
    relativeError: Float64Array;
  };
}

/**
 * Physicists' Hermite polynomial Hₙ(ξ) via recurrence:
 *   H₀(ξ) = 1
 *   H₁(ξ) = 2ξ
 *   Hₙ(ξ) = 2ξHₙ₋₁(ξ) - 2(n-1)Hₙ₋₂(ξ)
 */
export function hermiteH(n: number, xi: number): number {
  if (n === 0) return 1;
  if (n === 1) return 2 * xi;
  let hPrev = 1, hCurr = 2 * xi;
  for (let k = 2; k <= n; k++) {
    const hNext = 2 * xi * hCurr - 2 * (k - 1) * hPrev;
    hPrev = hCurr;
    hCurr = hNext;
  }
  return hCurr;
}

/** log of n! to avoid overflow */
function logFactorial(n: number): number {
  let s = 0;
  for (let k = 2; k <= n; k++) s += Math.log(k);
  return s;
}

/**
 * Analytical harmonic oscillator wavefunction ψₙ(x).
 * In AU with mass m and frequency ω.
 */
export function harmonicEigenstate(n: number, omega: number, mass: number, x: number): number {
  const xi = Math.sqrt(mass * omega) * x;
  const logNorm = 0.25 * Math.log(mass * omega / Math.PI) - 0.5 * logFactorial(n) - 0.5 * n * Math.log(2);
  const H = hermiteH(n, xi);
  return Math.exp(logNorm) * H * Math.exp(-xi * xi / 2);
}

/** Solve quantum harmonic oscillator for nMax states */
export function solveHarmonicOscillator(params: HarmonicParams): HarmonicResult {
  const { omega, mass, N, xRange, nMax } = params;
  const dx = (2 * xRange) / (N - 1);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = -xRange + i * dx;

  const states: HarmonicState[] = [];
  const energySpectrum = new Float64Array(nMax);

  for (let n = 0; n < nMax; n++) {
    const En = omega * (n + 0.5);
    energySpectrum[n] = En;

    const psi = new Float64Array(N);
    const probDensity = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      psi[i] = harmonicEigenstate(n, omega, mass, x[i]);
      probDensity[i] = psi[i] * psi[i];
    }

    // Nodes: n nodes for ψₙ (from Hermite polynomial zeros)
    // Approximate: zeros of Hₙ — numerically find sign changes
    const nodes: number[] = [];
    for (let i = 1; i < N; i++) {
      if (psi[i - 1] * psi[i] < 0) {
        // Linear interpolation to find zero crossing
        const t = -psi[i - 1] / (psi[i] - psi[i - 1]);
        nodes.push(x[i - 1] + t * dx);
      }
    }

    // Analytical expectation values
    const xExp = 0; // ⟨x⟩ = 0 by parity
    const x2Exp = (n + 0.5) / (mass * omega); // ⟨x²⟩ = (n+½)/(mω)
    const deltaX = Math.sqrt(x2Exp);
    const p2Exp = mass * omega * (n + 0.5); // ⟨p²⟩ = mω(n+½)
    const deltaP = Math.sqrt(p2Exp);
    const deltaXDeltaP = n + 0.5; // = ħ(n+½) = n+½ in AU

    states.push({
      n, energy: En, energyAnalytical: En, psi, probDensity, nodes,
      xExp, x2Exp, deltaX, p2Exp, deltaP, deltaXDeltaP,
    });
  }

  // FDM validation: compare first 5 eigenvalues
  const Vfn = (xi: number) => 0.5 * mass * omega * omega * xi * xi;
  const fdm = fdmEigensolve(-xRange, xRange, Math.min(N, 512), Vfn, Math.min(nMax, 10), mass);

  const nComp = fdm.eigenvalues.length;
  const analytical = new Float64Array(nComp);
  const fdmVals = new Float64Array(nComp);
  const relErr = new Float64Array(nComp);

  for (let i = 0; i < nComp; i++) {
    analytical[i] = omega * (i + 0.5);
    fdmVals[i] = fdm.eigenvalues[i];
    relErr[i] = Math.abs((fdmVals[i] - analytical[i]) / analytical[i]);
    // Attach FDM wavefunction to states
    if (i < states.length && fdm.eigenvectors[i]) {
      states[i].psiFDM = fdm.eigenvectors[i].toReArray();
    }
  }

  return {
    x, dx, omega, states, energySpectrum,
    fdmComparison: { eigenvaluesFDM: fdmVals, eigenvalueAnalytical: analytical, relativeError: relErr },
  };
}

/**
 * Coherent state (Glauber state) α:
 * ψ_α(x) = Σₙ e^{-|α|²/2} αⁿ/√n! ψₙ(x)
 * This is a classical-like Gaussian wave packet that preserves its shape.
 */
export function coherentState(alpha: [number, number], omega: number, mass: number, x: Float64Array, N: number): ComplexArray {
  const [aR, aI] = alpha;
  const alphaMod2 = aR * aR + aI * aI;
  const nTerms = Math.min(30, Math.max(10, Math.ceil(3 * alphaMod2) + 10));

  const psi = new ComplexArray(x.length);

  let logAlphaN = 0;     // log|α|^n
  let argAlphaN = 0;     // n·arg(α)
  const argAlpha = Math.atan2(aI, aR);
  const logAlpha = 0.5 * Math.log(alphaMod2 + 1e-100);

  for (let n = 0; n < nTerms; n++) {
    if (n > 0) {
      logAlphaN += logAlpha;
      argAlphaN += argAlpha;
    }
    const coeff = Math.exp(-alphaMod2 / 2 + logAlphaN - 0.5 * logFactorial(n));
    const cr = coeff * Math.cos(argAlphaN);
    const ci = coeff * Math.sin(argAlphaN);

    for (let i = 0; i < x.length; i++) {
      const pn = harmonicEigenstate(n, omega, mass, x[i]);
      psi.data[2 * i]     += cr * pn;
      psi.data[2 * i + 1] += ci * pn;
    }
  }

  return psi;
}
