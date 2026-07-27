/**
 * Eigenvalue solver for 1D quantum systems using Finite Difference Method.
 *
 * Discretizes the Hamiltonian H = -ħ²/(2m) ∂²/∂x² + V(x) as a tridiagonal
 * matrix and finds the lowest nEigen eigenvalues/eigenvectors using the
 * power iteration / inverse iteration method, or an analytic tridiagonal solver.
 *
 * In atomic units (ħ=1, me=1).
 */

import { ComplexArray } from '../utils/complex';

export interface EigenResult {
  eigenvalues: Float64Array;   // Energy eigenvalues [a.u.]
  eigenvectors: ComplexArray[]; // Corresponding eigenstates
  x: Float64Array;             // Spatial grid
  dx: number;
}

/**
 * Solve for lowest `nEigen` eigenstates of H = T + V on [xMin, xMax]
 * using FDM tridiagonal diagonalization.
 *
 * Uses Thomas algorithm + QR-like Householder tridiagonal eigensolver.
 * For N up to ~2000, this is fast enough to run in-browser.
 */
export function fdmEigensolve(
  xMin: number,
  xMax: number,
  N: number,
  V: (x: number) => number,
  nEigen: number,
  mass: number = 1
): EigenResult {
  const dx = (xMax - xMin) / (N - 1);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = xMin + i * dx;

  // Kinetic energy coefficient: t = -1/(2m·dx²) [a.u.]
  const t = -1 / (2 * mass * dx * dx);

  // Build symmetric tridiagonal matrix:
  // Diagonal: -2t + V(x)
  // Off-diagonal: t
  const diag = new Float64Array(N);
  const offDiag = new Float64Array(N - 1);

  for (let i = 0; i < N; i++) {
    diag[i] = -2 * t + V(x[i]);
  }
  for (let i = 0; i < N - 1; i++) {
    offDiag[i] = t;
  }

  // Apply Dirichlet BC: effectively already done by finite grid with BC ψ(xMin)=ψ(xMax)=0
  // The first and last points are boundary; their BC is automatic for infinite well.

  // Use Lanczos/power iteration to find lowest nEigen eigenvalues
  // For simplicity and correctness, use QR iteration on tridiagonal
  return tridiagonalEigenSolve(diag, offDiag, x, dx, nEigen);
}

/**
 * QR iteration on a symmetric tridiagonal matrix to find all eigenvalues/vectors.
 * Then return the lowest nEigen.
 *
 * Note: This is O(N²) per iteration × O(N) iterations = O(N³) total.
 * For N=512, this is ~1.3×10⁸ ops — acceptable for browser use.
 */
function tridiagonalEigenSolve(
  diag: Float64Array,
  offDiag: Float64Array,
  x: Float64Array,
  dx: number,
  nEigen: number
): EigenResult {
  const N = diag.length;

  // Copy to mutable arrays
  const d = Float64Array.from(diag);
  const e = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) e[i + 1] = offDiag[i];

  // Initialize eigenvector matrix as identity
  const Z = new Float64Array(N * N);
  for (let i = 0; i < N; i++) Z[i * N + i] = 1;

  // QL algorithm for symmetric tridiagonal (LAPACK's DSTEQR-like)
  const MAXITER = 30 * N;
  const EPS = 2.2e-16;

  for (let l = 0; l < N; l++) {
    let iter = 0;
    let m: number;
    do {
      for (m = l; m < N - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m + 1]) <= EPS * dd) break;
      }
      if (m !== l) {
        if (iter++ > MAXITER) break;
        // Form shift
        let g = (d[l + 1] - d[l]) / (2 * e[l + 1]);
        let r = Math.sqrt(g * g + 1);
        g = d[m] - d[l] + e[l + 1] / (g + (g >= 0 ? r : -r));
        let s = 1, c = 1, p = 0;
        for (let i = m - 1; i >= l; i--) {
          let f = s * e[i + 1];
          const b = c * e[i + 1];
          if (Math.abs(f) >= Math.abs(g)) {
            c = g / f;
            r = Math.sqrt(c * c + 1);
            e[i + 2] = f * r;
            s = 1 / r;
            c *= s;
          } else {
            s = f / g;
            r = Math.sqrt(s * s + 1);
            e[i + 2] = g * r;
            c = 1 / r;
            s *= c;
          }
          g = d[i + 1] - p;
          r = (d[i] - g) * s + 2 * c * b;
          p = s * r;
          d[i + 1] = g + p;
          g = c * r - b;
          // Accumulate eigenvectors
          for (let k = 0; k < N; k++) {
            f = Z[k * N + i + 1];
            Z[k * N + i + 1] = s * Z[k * N + i] + c * f;
            Z[k * N + i] = c * Z[k * N + i] - s * f;
          }
        }
        d[l] -= p;
        e[l + 1] = g;
        e[m + 1] = 0;
      }
    } while (m !== l);
  }

  // Sort eigenvalues ascending and select lowest nEigen
  const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => d[a] - d[b]);
  const nOut = Math.min(nEigen, N);

  const eigenvalues = new Float64Array(nOut);
  const eigenvectors: ComplexArray[] = [];

  for (let j = 0; j < nOut; j++) {
    const col = idx[j];
    eigenvalues[j] = d[col];
    const ev = new ComplexArray(N, (i) => [Z[i * N + col], 0]);
    // Normalize
    ev.normalize(dx);
    // Ensure positive convention (first non-zero element positive)
    let firstNonZero = 0;
    for (let i = 0; i < N; i++) {
      if (Math.abs(ev.re(i)) > 1e-10) { firstNonZero = ev.re(i); break; }
    }
    if (firstNonZero < 0) {
      for (let i = 0; i < ev.data.length; i++) ev.data[i] = -ev.data[i];
    }
    eigenvectors.push(ev);
  }

  return { eigenvalues, eigenvectors, x, dx };
}
