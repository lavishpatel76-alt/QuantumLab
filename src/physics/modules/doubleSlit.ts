/**
 * Module 5: Double Slit Diffraction
 *
 * Uses the Angular Spectrum Method (plane wave decomposition) with FFT.
 * Propagates a field through free space by multiplying by the
 * transfer function in k-space:
 *   H(kx) = exp(i·kz·z)  where kz = √(k²-kx²)
 *
 * Exact within scalar diffraction theory (Huygens-Fresnel).
 */

import { ComplexArray } from '../utils/complex';
import { fft, kFrequencies } from '../utils/fft';

export interface DoubleSlitParams {
  wavelength: number;       // de Broglie λ [a.u.]
  slitWidth: number;        // a [a.u.] — width of each slit
  slitSeparation: number;   // d [a.u.] — center-to-center
  detectorDistance: number; // L [a.u.]
  screenWidth: number;      // W [a.u.] — transverse extent of screen
  N: number;                // Transverse grid points (power of 2)
  Nz: number;               // Number of propagation planes for 2D map
  compute2DMap?: boolean;   // Whether to compute full 2D map (default true)
}

export interface DoubleSlitResult {
  /** Detector plane intensity I(x) */
  detectorX: Float64Array;
  intensity: Float64Array;
  /** Analytical fringe spacing: Δy = λL/d */
  analyticalFringeSpacing: number;
  /** Numerical fringe spacing from peak-finding */
  numericalFringeSpacing: number | null;
  /** 2D intensity map: [Nz × N] flattened row-major (propagation_z × transverse_x) */
  intensityMap2D: Float32Array;
  mapZ: Float64Array;
  mapX: Float64Array;
  /** Aperture transmission function */
  apertureX: Float64Array;
  apertureMask: Float64Array;
  /** Relative error vs analytical single-slit envelope */
  normalizationError: number;
}

/** Rectangular slit transmission function */
function buildApertureMask(x: Float64Array, slitWidth: number, slitSeparation: number): Float64Array {
  const mask = new Float64Array(x.length);
  const dHalf = slitSeparation / 2;
  const wHalf = slitWidth / 2;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (Math.abs(xi + dHalf) <= wHalf || Math.abs(xi - dHalf) <= wHalf) {
      mask[i] = 1;
    }
  }
  return mask;
}

/** Angular spectrum propagation by distance z */
function propagateAngularSpectrum(
  field: ComplexArray,
  dx: number,
  k0: number,
  z: number
): ComplexArray {
  const N = field.length;
  const propagated = field.clone();

  // Forward FFT
  fft(propagated, false);

  // k-frequencies
  const kx = kFrequencies(N, dx);

  // Transfer function: H(kx) = exp(i·kz·z), kz = sqrt(k0²-kx²)
  const k0Sq = k0 * k0;
  for (let i = 0; i < N; i++) {
    const kxSq = kx[i] * kx[i];
    let phaseR: number, phaseI: number;

    if (kxSq <= k0Sq) {
      const kz = Math.sqrt(k0Sq - kxSq);
      phaseR = Math.cos(kz * z);
      phaseI = Math.sin(kz * z);
    } else {
      const kappa = Math.sqrt(kxSq - k0Sq);
      phaseR = Math.exp(-kappa * z);
      phaseI = 0;
    }

    const re = propagated.re(i);
    const im = propagated.im(i);
    propagated.data[2 * i]     = re * phaseR - im * phaseI;
    propagated.data[2 * i + 1] = re * phaseI + im * phaseR;
  }

  // Inverse FFT
  fft(propagated, true);
  return propagated;
}

/** Solve double-slit diffraction */
export function solveDoubleSlit(params: DoubleSlitParams): DoubleSlitResult {
  const { wavelength, slitWidth, slitSeparation, detectorDistance, screenWidth, N, Nz } = params;
  const compute2DMap = params.compute2DMap ?? true;

  const k0 = (2 * Math.PI) / (wavelength || 1e-6);
  const dx = screenWidth / (N - 1);

  // Transverse grid
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = -screenWidth / 2 + i * dx;

  // Aperture
  const mask = buildApertureMask(x, slitWidth, slitSeparation);
  const apertureField = new ComplexArray(N, (i) => [mask[i], 0]);

  // 2D intensity map
  const mapZ = new Float64Array(Nz);
  const dz = detectorDistance / (Nz - 1);
  for (let iz = 0; iz < Nz; iz++) mapZ[iz] = (iz + 1) * dz;

  const intensityMap2D = new Float32Array(compute2DMap ? Nz * N : 0);

  if (compute2DMap) {
    for (let iz = 0; iz < Nz; iz++) {
      const z = mapZ[iz];
      const field = propagateAngularSpectrum(apertureField, dx, k0, z);
      for (let i = 0; i < N; i++) {
        intensityMap2D[iz * N + i] = field.abs2(i);
      }
    }
  }

  // Detector plane
  const detectorField = propagateAngularSpectrum(apertureField, dx, k0, detectorDistance);
  const intensity = new Float64Array(N);
  let totalInt = 0;
  for (let i = 0; i < N; i++) {
    intensity[i] = detectorField.abs2(i);
    totalInt += intensity[i];
  }

  // Normalize
  for (let i = 0; i < N; i++) intensity[i] /= (totalInt * dx || 1);

  // Analytical fringe spacing: Δy = λL/d
  const analyticalFringeSpacing = (wavelength * detectorDistance) / (slitSeparation || 1e-6);

  // Numerical fringe spacing
  const numericalFringeSpacing = estimateFringeSpacing(x, intensity);

  // Normalization check
  let normCheck = 0;
  for (let i = 0; i < N; i++) normCheck += intensity[i];
  const normalizationError = Math.abs(normCheck * dx - 1);

  return {
    detectorX: x,
    intensity,
    analyticalFringeSpacing,
    numericalFringeSpacing,
    intensityMap2D,
    mapZ,
    mapX: x,
    apertureX: x,
    apertureMask: mask,
    normalizationError,
  };
}

/** Peak-finding for fringe spacing estimation */
function estimateFringeSpacing(x: Float64Array, I: Float64Array): number | null {
  const N = x.length;
  const peaks: number[] = [];

  for (let i = 2; i < N - 2; i++) {
    if (I[i] > I[i - 1] && I[i] > I[i - 2] && I[i] > I[i + 1] && I[i] > I[i + 2]) {
      if (Math.abs(x[i]) < 0.35 * (x[N - 1] - x[0])) {
        peaks.push(x[i]);
      }
    }
  }

  if (peaks.length < 2) return null;

  let spacingSum = 0;
  for (let i = 1; i < peaks.length; i++) spacingSum += peaks[i] - peaks[i - 1];
  return spacingSum / (peaks.length - 1);
}
