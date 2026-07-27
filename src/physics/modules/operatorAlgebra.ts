/**
 * Module 8: Operator Algebra
 *
 * Represents quantum operators as dense matrices on a finite-difference grid.
 * Computes commutators, expectation values, and eigenvalues.
 *
 * In atomic units (ħ=1, me=1, a₀=1).
 */

import { ComplexArray } from '../utils/complex';

export interface OperatorMatrix {
  name: string;
  /** N×N matrix stored as [re0, im0, re1, im1, ...] for each element row-major */
  dataRe: Float64Array;
  dataIm: Float64Array;
  N: number;
}

export interface CommutatorResult {
  operatorA: string;
  operatorB: string;
  /** [A, B] = AB - BA */
  commutator: OperatorMatrix;
  /** Matrix elements of [A, B] */
  commutatorTrace: [number, number]; // Tr([A,B])
  /** For canonical pair: [x̂, p̂] = iħ·I — verify numerically */
  canonicalCheck?: number; // | Tr([x,p]) / (iN) - 1 | if x and p
}

/** Build position operator x̂ as a diagonal matrix */
export function buildXOperator(x: Float64Array): OperatorMatrix {
  const N = x.length;
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let i = 0; i < N; i++) re[i * N + i] = x[i];
  return { name: 'x̂', dataRe: re, dataIm: im, N };
}

/** Build momentum operator p̂ = -iħ d/dx via central finite differences */
export function buildPOperator(x: Float64Array): OperatorMatrix {
  const N = x.length;
  const dx = x[1] - x[0];
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  const coeff = 1 / (2 * dx); // ħ/(2dx), ħ=1 in AU

  // p̂ = -i·(d/dx): off-diagonal elements
  // (p̂)_{ij} = -i·(δ_{i,j+1} - δ_{i,j-1})/(2dx)
  for (let i = 1; i < N - 1; i++) {
    im[i * N + (i + 1)] = -coeff;  // -i·coeff → im part = -coeff
    im[i * N + (i - 1)] = +coeff;
  }
  // Periodic or Dirichlet BC (use zero BC for bound states)
  return { name: 'p̂', dataRe: re, dataIm: im, N };
}

/** Build kinetic energy operator T̂ = p̂²/(2m) = -ħ²/(2m) d²/dx² */
export function buildTOperator(x: Float64Array, mass: number = 1): OperatorMatrix {
  const N = x.length;
  const dx = x[1] - x[0];
  const coeff = 1 / (2 * mass * dx * dx);
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);

  for (let i = 1; i < N - 1; i++) {
    re[i * N + i]         = 2 * coeff;
    re[i * N + (i + 1)]   = -coeff;
    re[i * N + (i - 1)]   = -coeff;
  }
  return { name: 'T̂', dataRe: re, dataIm: im, N };
}

/** Build Hamiltonian H = T + V */
export function buildHamiltonian(x: Float64Array, V: Float64Array, mass: number = 1): OperatorMatrix {
  const T = buildTOperator(x, mass);
  const N = x.length;
  const re = Float64Array.from(T.dataRe);
  const im = Float64Array.from(T.dataIm);
  for (let i = 0; i < N; i++) re[i * N + i] += V[i];
  return { name: 'Ĥ', dataRe: re, dataIm: im, N };
}

/** Build angular momentum Lz = -iħ(x·d/dy - y·d/dx) — simplified 1D proxy */
export function buildLzOperator1D(x: Float64Array): OperatorMatrix {
  // In 1D, Lz is trivial; return as info placeholder
  return buildPOperator(x); // Represents L ~ xp
}

/** Matrix multiplication C = A·B (complex, dense N×N) */
export function matMul(A: OperatorMatrix, B: OperatorMatrix): OperatorMatrix {
  const N = A.N;
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);

  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      const arIK = A.dataRe[i * N + k], aiIK = A.dataIm[i * N + k];
      if (Math.abs(arIK) < 1e-15 && Math.abs(aiIK) < 1e-15) continue;
      for (let j = 0; j < N; j++) {
        const brKJ = B.dataRe[k * N + j], biKJ = B.dataIm[k * N + j];
        re[i * N + j] += arIK * brKJ - aiIK * biKJ;
        im[i * N + j] += arIK * biKJ + aiIK * brKJ;
      }
    }
  }

  return { name: `${A.name}·${B.name}`, dataRe: re, dataIm: im, N };
}

/** Commutator [A, B] = AB - BA */
export function commutator(A: OperatorMatrix, B: OperatorMatrix): CommutatorResult {
  const AB = matMul(A, B);
  const BA = matMul(B, A);
  const N = A.N;
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) {
    re[i] = AB.dataRe[i] - BA.dataRe[i];
    im[i] = AB.dataIm[i] - BA.dataIm[i];
  }
  const comm: OperatorMatrix = { name: `[${A.name}, ${B.name}]`, dataRe: re, dataIm: im, N };

  // Trace
  let trRe = 0, trIm = 0;
  for (let i = 0; i < N; i++) { trRe += re[i * N + i]; trIm += im[i * N + i]; }

  return {
    operatorA: A.name,
    operatorB: B.name,
    commutator: comm,
    commutatorTrace: [trRe, trIm],
  };
}

/** Expectation value ⟨ψ|Â|ψ⟩ */
export function expectationValue(psi: ComplexArray, A: OperatorMatrix): [number, number] {
  const N = psi.length;
  let re = 0, im = 0;
  // ⟨ψ|A|ψ⟩ = Σ_ij ψ*_i A_ij ψ_j
  for (let i = 0; i < N; i++) {
    const piR = psi.re(i), piI = psi.im(i);
    for (let j = 0; j < N; j++) {
      const pjR = psi.re(j), pjI = psi.im(j);
      const aR = A.dataRe[i * N + j], aI = A.dataIm[i * N + j];
      // ψ*_i · A_ij · ψ_j = (piR - i·piI)(aR + i·aI)(pjR + i·pjI)
      const ApsijR = aR * pjR - aI * pjI;
      const ApsijI = aR * pjI + aI * pjR;
      re += piR * ApsijR + piI * ApsijI;
      im += piR * ApsijI - piI * ApsijR;
    }
  }
  return [re, im];
}

/** Get matrix diagonal elements */
export function getMatrixDiagonal(A: OperatorMatrix): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(A.N);
  const im = new Float64Array(A.N);
  for (let i = 0; i < A.N; i++) {
    re[i] = A.dataRe[i * A.N + i];
    im[i] = A.dataIm[i * A.N + i];
  }
  return { re, im };
}

/** Extract NxN submatrix for display (center portion if N too large) */
export function getDisplayMatrix(A: OperatorMatrix, displaySize: number = 8): {
  re: number[][]; im: number[][]; size: number
} {
  const size = Math.min(displaySize, A.N);
  const offset = Math.floor((A.N - size) / 2);
  const re: number[][] = [], im: number[][] = [];

  for (let i = 0; i < size; i++) {
    re[i] = [];
    im[i] = [];
    for (let j = 0; j < size; j++) {
      re[i][j] = A.dataRe[(i + offset) * A.N + (j + offset)];
      im[i][j] = A.dataIm[(i + offset) * A.N + (j + offset)];
    }
  }
  return { re, im, size };
}
