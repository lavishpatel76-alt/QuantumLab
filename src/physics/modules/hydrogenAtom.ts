/**
 * Module 6: Hydrogen Atom
 *
 * Analytical solutions to the Hydrogen Schrödinger equation in spherical coords:
 *   ψ_nlm(r,θ,φ) = R_nl(r) · Y_l^m(θ,φ)
 *
 * In atomic units (a₀=1, Eh=1):
 *   Eₙ = -1/(2n²)
 *   R_nl(r) = -√[(2/n)³ · (n-l-1)!/(2n·((n+l)!)^3)] · e^{-r/n} · (2r/n)^l · L_{n-l-1}^{2l+1}(2r/n)
 */

export interface OrbitalParams {
  n: number;        // Principal quantum number (1-4)
  l: number;        // Orbital quantum number (0..n-1)
  m: number;        // Magnetic quantum number (-l..l)
  Nr: number;       // Radial grid points
  Ntheta: number;    // Angular grid points
  rMax?: number;     // Maximum r [a.u.]
  nPoints?: number;  // Number of 3D point cloud samples (default 12000)
}

export interface OrbitalResult {
  n: number; l: number; m: number;
  energy: number;           // Eₙ = -1/(2n²) [a.u.]
  rGrid: Float64Array;      // Radial grid [a.u.]
  radialWF: Float64Array;   // R_nl(r)
  radialProbDensity: Float64Array; // P(r) = r²|R_nl|²
  mostProbableRadius: number;
  meanRadius: number;       // ⟨r⟩ = (3n² - l(l+1))/2 [a.u.]
  /** 3D point cloud: [x,y,z, signed_psi] × nPoints */
  pointCloud: Float32Array;
  /** Cross-section signed ψ on xz plane */
  crossSection: Float32Array;
  crossSectionSize: number;
  crossSectionRange: number;
  angularDensity: Float64Array;
  thetaGrid: Float64Array;
  nodes: { radialNodes: number; angularNodes: number };
}

/** Associated Laguerre polynomial L_n^alpha(x) via recurrence */
function laguerreAssoc(n: number, alpha: number, x: number): number {
  if (n === 0) return 1;
  if (n === 1) return 1 + alpha - x;
  let prev = 1, curr = 1 + alpha - x;
  for (let k = 2; k <= n; k++) {
    const next = ((2 * k - 1 + alpha - x) * curr - (k - 1 + alpha) * prev) / k;
    prev = curr;
    curr = next;
  }
  return curr;
}

/** Factorial n! */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

/** Precomputed fast evaluator for radial wavefunction R_nl(r) */
export function createRadialEvaluator(n: number, l: number) {
  const num = factorial(n - l - 1);
  const den = 2 * n * Math.pow(factorial(n + l), 3);
  const norm = den > 0 ? Math.sqrt((8 / (n * n * n)) * (num / den)) : 0;
  const alpha = 2 * l + 1;
  const nSub = n - l - 1;

  return (r: number): number => {
    if (r <= 0) return 0;
    const rho = (2 * r) / n;
    const Laguerre = laguerreAssoc(nSub, alpha, rho);
    return -norm * Math.exp(-rho / 2) * Math.pow(rho, l) * Laguerre;
  };
}

/** Precomputed fast evaluator for real spherical harmonics Y_l^m(θ, φ) */
export function createAngularEvaluator(l: number, m: number) {
  const absM = Math.abs(m);
  const normFactor = Math.sqrt(
    ((2 * l + 1) / (4 * Math.PI)) * (factorial(l - absM) / factorial(l + absM))
  );

  return (theta: number, phi: number): number => {
    const P = associatedLegendre(l, absM, Math.cos(theta));
    if (m > 0) return Math.SQRT2 * normFactor * P * Math.cos(m * phi);
    if (m < 0) return Math.SQRT2 * normFactor * P * Math.sin(-m * phi);
    return normFactor * P;
  };
}

/** Associated Legendre polynomial P_l^m(x) for x = cos(θ), m ≥ 0 */
function associatedLegendre(l: number, m: number, x: number): number {
  let pmm = 1;
  if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    let fact = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2;
    }
  }
  if (l === m) return pmm;

  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;

  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

export function radialWavefunction(n: number, l: number, r: number): number {
  return createRadialEvaluator(n, l)(r);
}

export function realSphericalHarmonic(l: number, m: number, theta: number, phi: number): number {
  return createAngularEvaluator(l, m)(theta, phi);
}

export function hydrogenPsi(n: number, l: number, m: number, r: number, theta: number, phi: number): number {
  return radialWavefunction(n, l, r) * realSphericalHarmonic(l, m, theta, phi);
}

/** Solve and prepare hydrogen orbital data */
export function solveHydrogenOrbital(params: OrbitalParams): OrbitalResult {
  const { n, l, m, Nr, Ntheta } = params;

  // Optimized effective sampling radius
  const rMaxEff = params.rMax ?? Math.min(80, 2.5 * n * n + 6 * n + 4);
  const nPoints = params.nPoints ?? 12000;

  const energy = -1 / (2 * n * n);

  // Radial grid
  const dr = rMaxEff / (Nr - 1);
  const rGrid = new Float64Array(Nr);
  for (let i = 0; i < Nr; i++) rGrid[i] = i * dr;

  const getRadial = createRadialEvaluator(n, l);
  const getAngular = createAngularEvaluator(l, m);

  const radialWF = new Float64Array(Nr);
  const radialProbDensity = new Float64Array(Nr);

  let maxR2R2 = 0, mostProbableRadius = 0;
  for (let i = 0; i < Nr; i++) {
    const r = rGrid[i];
    const R = getRadial(r);
    radialWF[i] = R;
    const P = r * r * R * R;
    radialProbDensity[i] = P;
    if (P > maxR2R2) {
      maxR2R2 = P;
      mostProbableRadius = r;
    }
  }

  // Mean radius ⟨r⟩
  const meanRadius = (3 * n * n - l * (l + 1)) / 2;

  // Angular density grid
  const thetaGrid = new Float64Array(Ntheta);
  const angularDensity = new Float64Array(Ntheta);
  for (let i = 0; i < Ntheta; i++) {
    thetaGrid[i] = (i * Math.PI) / (Ntheta - 1);
    const Y = getAngular(thetaGrid[i], 0);
    angularDensity[i] = Y * Y;
  }

  // Fast Monte Carlo rejection sampling for 3D point cloud
  const pointCloud = new Float32Array(nPoints * 4); // [x, y, z, signed_psi]

  // Upper bound estimate for acceptance
  const maxY2 = ((2 * l + 1) / (4 * Math.PI)) * 2;
  const maxAcceptProb = maxR2R2 * maxY2 * 1.25;

  const rng = lcgRandom(n * 100 + l * 10 + Math.abs(m) + 1);

  let accepted = 0;
  let attempts = 0;
  const maxAttempts = nPoints * 150;

  while (accepted < nPoints && attempts < maxAttempts) {
    attempts++;
    const u = rng();
    const r = rMaxEff * Math.pow(u, 1 / 3);
    const cosTheta = 2 * rng() - 1;
    const theta = Math.acos(cosTheta);
    const phi = 2 * Math.PI * rng();

    const R = getRadial(r);
    const Y = getAngular(theta, phi);
    const psiVal = R * Y;
    const psi2 = psiVal * psiVal;

    const densityVal = r * r * psi2;

    if (rng() * maxAcceptProb < densityVal) {
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      pointCloud[accepted * 4 + 0] = r * sinTheta * Math.cos(phi);
      pointCloud[accepted * 4 + 1] = r * sinTheta * Math.sin(phi);
      pointCloud[accepted * 4 + 2] = r * cosTheta;
      pointCloud[accepted * 4 + 3] = psiVal; // Store SIGNED wavefunction for phase coloring!
      accepted++;
    }
  }

  const finalCloud = accepted === nPoints ? pointCloud : pointCloud.slice(0, accepted * 4);

  // 2D Cross-section on XZ plane (y=0, phi=0 or pi)
  // Evaluating on XZ plane captures both Z-oriented (pz, dz2) and X/Y-oriented (px) lobes!
  const csSize = 128;
  const csRange = Math.min(60, rMaxEff * 0.85);
  const crossSection = new Float32Array(csSize * csSize);

  for (let iz = 0; iz < csSize; iz++) {
    for (let ix = 0; ix < csSize; ix++) {
      const xVal = -csRange + (2 * csRange * ix) / (csSize - 1);
      const zVal = -csRange + (2 * csRange * iz) / (csSize - 1);
      const ri = Math.sqrt(xVal * xVal + zVal * zVal);
      const theta = ri === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, zVal / ri)));
      const phi = xVal >= 0 ? 0 : Math.PI;

      const R = getRadial(ri);
      const Y = getAngular(theta, phi);
      crossSection[iz * csSize + ix] = R * R * Y * Y;
    }
  }

  // Node counting
  let radialNodes = 0;
  for (let i = 1; i < Nr; i++) {
    if (radialWF[i - 1] * radialWF[i] < 0) radialNodes++;
  }

  return {
    n, l, m, energy, rGrid, radialWF, radialProbDensity,
    mostProbableRadius, meanRadius,
    pointCloud: finalCloud, crossSection, crossSectionSize: csSize, crossSectionRange: csRange,
    angularDensity, thetaGrid,
    nodes: { radialNodes, angularNodes: l },
  };
}

/** Linear Congruential Generator for deterministic sampling */
function lcgRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
