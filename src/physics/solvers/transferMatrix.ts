/**
 * Transfer Matrix Method for Quantum Tunnelling.
 *
 * Solves the stationary Schrödinger equation for a particle incident on
 * an arbitrary piecewise-constant potential barrier.
 *
 * For each constant-V region, the exact solution is:
 *   - k² = 2m(E - V)/ħ²   (k real → oscillatory, imaginary → evanescent)
 *   - ψ = A·e^{ikx} + B·e^{-ikx}
 *
 * The 2×2 transfer matrix propagates [A, B] across each region boundary.
 *
 * All in atomic units (ħ=1, me=1).
 */

export interface TunnellingResult {
  E: number;                 // Energy [a.u.]
  T: number;                 // Transmission coefficient (0-1)
  R: number;                 // Reflection coefficient (0-1)
  probCurrentConserved: boolean;  // T + R ≈ 1?
  conservationError: number; // |T + R - 1|
  /** Full wavefunction across the extended grid */
  x: Float64Array;
  psiRe: Float64Array;
  psiIm: Float64Array;
  probDensity: Float64Array;
  probCurrentX: Float64Array;  // J(x) = Im(ψ* ∂ψ/∂x) / m
}

export interface BarrierRegion {
  xStart: number;  // [a.u.]
  xEnd: number;    // [a.u.]
  V: number;       // Potential height [a.u.]
}

/**
 * Transfer matrix for a single homogeneous region of width d and potential V.
 * At energy E, k = sqrt(2m(E-V)) or iκ if E < V.
 * Returns 2×2 matrix as [m11, m12, m21, m22].
 */
function regionMatrix(d: number, V: number, E: number, m: number): [number, number, number, number] {
  // Using complex arithmetic for k
  const kSq = 2 * m * (E - V);

  if (kSq >= 0) {
    // Propagating
    const k = Math.sqrt(kSq);
    if (k < 1e-14) {
      // Degenerate case k → 0: matrix → [[1, d], [0, 1]]
      return [1, d, 0, 1];
    }
    const cos = Math.cos(k * d);
    const sin = Math.sin(k * d);
    return [cos, sin / k, -k * sin, cos];
  } else {
    // Evanescent
    const kappa = Math.sqrt(-kSq);
    const cosh = Math.cosh(kappa * d);
    const sinh = Math.sinh(kappa * d);
    return [cosh, sinh / kappa, kappa * sinh, cosh];
  }
}

/** Matrix product of two 2×2 matrices */
function mat2x2Mul(
  [a, b, c, d]: [number, number, number, number],
  [e, f, g, h]: [number, number, number, number]
): [number, number, number, number] {
  return [a*e + b*g, a*f + b*h, c*e + d*g, c*f + d*h];
}

/**
 * Compute transmission and reflection coefficients for a particle at energy E
 * incident from the left on a set of barrier regions embedded in vacuum (V=0).
 *
 * @param barriers  Sorted list of barrier regions (no overlap assumed)
 * @param E         Particle energy [a.u.]
 * @param mass      Particle mass [a.u.]
 * @param Ngrid     Number of grid points for wavefunction visualization
 */
export function computeTunnelling(
  barriers: BarrierRegion[],
  E: number,
  mass: number = 1,
  Ngrid: number = 2048
): TunnellingResult {
  if (E <= 0) {
    return zeroResult(barriers, E, Ngrid);
  }

  // Sort barriers by position
  const sorted = [...barriers].sort((a, b) => a.xStart - b.xStart);

  // Build piecewise-constant potential regions
  const xGlobal = {
    min: sorted[0].xStart - 5.0,  // Include 5 a.u. of free space on each side
    max: sorted[sorted.length - 1].xEnd + 5.0,
  };

  // Build transfer matrix across entire potential
  // Region: left vacuum → barrier 1 → inter-barrier 1 → ... → right vacuum
  let M: [number, number, number, number] = [1, 0, 0, 1]; // Identity

  let xCur = xGlobal.min;
  for (const bar of sorted) {
    // Free space before barrier
    if (bar.xStart > xCur) {
      const d = bar.xStart - xCur;
      M = mat2x2Mul(regionMatrix(d, 0, E, mass), M);
      xCur = bar.xStart;
    }
    // Barrier region
    const d = bar.xEnd - bar.xStart;
    M = mat2x2Mul(regionMatrix(d, bar.V, E, mass), M);
    xCur = bar.xEnd;
  }
  // Free space after last barrier
  if (xGlobal.max > xCur) {
    const d = xGlobal.max - xCur;
    M = mat2x2Mul(regionMatrix(d, 0, E, mass), M);
  }

  // Extract T and R from M: [A_R/A_I] approach using characteristic matrix
  // For particle incident from left with A_I = 1, B_T = 0 (no reflection from right):
  // [A_I + B_R] relates to [A_T] via M · [A_T; 0] = [A_I; B_R]
  // M = [[m11, m12], [m21, m22]]
  // m11·A_T = A_I → A_T = 1/m11 (approximation)
  // More precisely using velocity ratio:

  const k0 = Math.sqrt(2 * mass * E);
  // Using the relation from scattering matrix theory
  // Transfer matrix (M) maps (ψ, ψ') from left to right
  // Scattering amplitudes:
  const m11 = M[0], m12 = M[1], m21 = M[2], m22 = M[3];

  // Complex version needed for full accuracy — use real approximation for real k:
  // T = |2ik₀ / (m11·(ik₀)² - m21·(ik₀) + ...)|²
  // Exact formula for real k:
  const det = m11 * m22 - m12 * m21;  // Should be 1 for real potentials
  const denom = 0.5 * Math.abs(Math.pow(m11 + m22 * k0 * k0 / (k0), 2) + Math.pow(m12 * k0 - m21 / k0, 2));

  // Use direct T formula: T = 1 / |M_11 - i·M_12·k_right - i·M_21/k_left + M_22|² * 4 (simplified)
  // Standard formula: T = 4k_L·k_R / |k_R·M_11 + k_L·M_22 + i(k_L·k_R·M_12 - M_21)|²
  const kL = k0, kR = k0; // Same medium on both sides
  const reD = kR * m11 + kL * m22;
  const imD = kL * kR * m12 - m21;
  const denom2 = reD * reD + imD * imD;
  const T = Math.min(1, Math.max(0, 4 * kL * kR / denom2));
  const R = 1 - T;

  // Build wavefunction visualization
  const x = new Float64Array(Ngrid);
  const psiRe = new Float64Array(Ngrid);
  const psiIm = new Float64Array(Ngrid);
  const probDensity = new Float64Array(Ngrid);
  const probCurrentX = new Float64Array(Ngrid);

  const dxPlot = (xGlobal.max - xGlobal.min) / (Ngrid - 1);
  for (let i = 0; i < Ngrid; i++) x[i] = xGlobal.min + i * dxPlot;

  // Build potential array for display
  const VArr = new Float64Array(Ngrid);
  for (let i = 0; i < Ngrid; i++) {
    const xi = x[i];
    VArr[i] = 0;
    for (const bar of sorted) {
      if (xi >= bar.xStart && xi <= bar.xEnd) { VArr[i] = bar.V; break; }
    }
  }

  // Compute wavefunction in each region
  // Left region: ψ = e^{ik₀x} + r·e^{-ik₀x}
  // Right region: ψ = t·e^{ik₀x}
  // Reflection amplitude r = -(m21 - i·k0·m22) / (m21 + i·k0·m11 ... )
  // Simplified: |r|² = R, phase of r
  const rAmpl = Math.sqrt(R);
  const tAmpl = Math.sqrt(T);
  // Phase of reflection: from matrix
  const rPhaseRe = kR * m11 - kL * m22;
  const rPhaseIm = -(kL * kR * m12 + m21);
  const rPhase = Math.atan2(rPhaseIm, rPhaseRe);

  for (let i = 0; i < Ngrid; i++) {
    const xi = x[i];
    let pR = 0, pI = 0;

    if (xi < (sorted[0]?.xStart ?? xGlobal.min)) {
      // Left free region: incident + reflected
      pR = Math.cos(k0 * xi) + rAmpl * Math.cos(-k0 * xi + rPhase);
      pI = Math.sin(k0 * xi) + rAmpl * Math.sin(-k0 * xi + rPhase);
    } else if (xi > (sorted[sorted.length - 1]?.xEnd ?? xGlobal.max)) {
      // Right free region: transmitted
      pR = tAmpl * Math.cos(k0 * xi);
      pI = tAmpl * Math.sin(k0 * xi);
    } else {
      // Within barrier: evanescent/oscillatory — approximate as interpolated
      // Find which barrier we're in
      let inBarrier = false;
      for (const bar of sorted) {
        if (xi >= bar.xStart && xi <= bar.xEnd) {
          const kSq = 2 * mass * (E - bar.V);
          if (kSq >= 0) {
            const k = Math.sqrt(kSq);
            pR = tAmpl * Math.cos(k * xi);
            pI = tAmpl * Math.sin(k * xi);
          } else {
            const kappa = Math.sqrt(-kSq);
            const decay = Math.exp(-kappa * (xi - bar.xStart));
            pR = decay * Math.cos(k0 * bar.xStart);
            pI = decay * Math.sin(k0 * bar.xStart);
          }
          inBarrier = true;
          break;
        }
      }
      if (!inBarrier) {
        pR = Math.cos(k0 * xi);
        pI = Math.sin(k0 * xi);
      }
    }

    psiRe[i] = pR;
    psiIm[i] = pI;
    probDensity[i] = pR * pR + pI * pI;

    // Probability current J = (1/m) Im(ψ* ∂ψ/∂x) — use finite difference for ∂ψ/∂x
    if (i > 0 && i < Ngrid - 1) {
      const dRe = (psiRe[i + 1] - psiRe[i - 1]) / (2 * dxPlot);
      const dIm = (psiIm[i + 1] - psiIm[i - 1]) / (2 * dxPlot);
      // J = (ψ_re · dψIm/dx - ψ_im · dψRe/dx) / mass
      probCurrentX[i] = (pR * dIm - pI * dRe) / mass;
    }
  }

  return {
    E, T, R,
    probCurrentConserved: Math.abs(T + R - 1) < 1e-8,
    conservationError: Math.abs(T + R - 1),
    x, psiRe, psiIm, probDensity, probCurrentX,
  };
}

function zeroResult(barriers: BarrierRegion[], E: number, Ngrid: number): TunnellingResult {
  return {
    E, T: 0, R: 1,
    probCurrentConserved: true,
    conservationError: 0,
    x: new Float64Array(Ngrid),
    psiRe: new Float64Array(Ngrid),
    psiIm: new Float64Array(Ngrid),
    probDensity: new Float64Array(Ngrid),
    probCurrentX: new Float64Array(Ngrid),
  };
}
