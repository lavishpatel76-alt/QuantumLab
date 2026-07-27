/**
 * Module 9: Quantum Measurement
 *
 * Implements projective measurement (von Neumann measurement) on a quantum state.
 * - Expand state in eigenbasis: ψ = Σ cₙ φₙ
 * - Probability of outcome n: Pₙ = |cₙ|² = |⟨φₙ|ψ⟩|²
 * - Post-measurement state collapses to φₙ
 * - Repeated measurement converges to Born rule distribution
 */

import { ComplexArray } from '../utils/complex';
import { innerProduct } from '../utils/expectation';

export interface MeasurementParams {
  /** Eigenbasis states (e.g., from particle in box) */
  eigenstates: ComplexArray[];
  eigenvalues: number[];
  dx: number;
}

export interface MeasurementResult {
  /** Expansion coefficients cₙ = ⟨φₙ|ψ⟩ */
  coefficients: Array<{ n: number; re: number; im: number; prob: number }>;
  /** Chosen measurement outcome index */
  chosenOutcome: number;
  /** Eigenvalue of chosen outcome */
  measuredValue: number;
  /** Post-collapse state */
  collapsedState: ComplexArray;
  /** Expectation value before measurement */
  expectationBefore: number;
  /** Normalization check: Σ|cₙ|² should = 1 */
  normalizationSum: number;
}

export interface RepeatedMeasurementData {
  nTrials: number;
  histogram: number[];       // counts per eigenstate
  frequencies: number[];     // counts/nTrials ≈ Pₙ
  theoreticalProbs: number[]; // |cₙ|²
  chiSquared: number;        // Goodness of fit
}

/**
 * Perform a single projective measurement of ψ in the given eigenbasis.
 * The outcome is sampled from the Born probability distribution.
 *
 * @param psi       State to measure
 * @param basis     MeasurementParams with eigenstates and eigenvalues
 * @param rng       Optional random number in [0,1] (default: Math.random())
 */
export function projectiveMeasure(
  psi: ComplexArray,
  basis: MeasurementParams,
  rng: number = Math.random()
): MeasurementResult {
  const { eigenstates, eigenvalues, dx } = basis;
  const N = psi.length;

  // Compute expansion coefficients cₙ = ⟨φₙ|ψ⟩
  const coefficients: MeasurementResult['coefficients'] = [];
  let normSum = 0;
  let expectBefore = 0;

  for (let n = 0; n < eigenstates.length; n++) {
    const [cRe, cIm] = innerProduct(eigenstates[n], psi, dx);
    const prob = cRe * cRe + cIm * cIm;
    coefficients.push({ n, re: cRe, im: cIm, prob });
    normSum += prob;
    expectBefore += prob * eigenvalues[n];
  }

  // Sample outcome from Born distribution
  let cumulative = 0;
  let chosenOutcome = eigenstates.length - 1; // fallback

  for (let n = 0; n < coefficients.length; n++) {
    cumulative += coefficients[n].prob / (normSum || 1);
    if (rng <= cumulative) {
      chosenOutcome = n;
      break;
    }
  }

  const measuredValue = eigenvalues[chosenOutcome];
  const collapsedState = eigenstates[chosenOutcome].clone();

  return {
    coefficients,
    chosenOutcome,
    measuredValue,
    collapsedState,
    expectationBefore: expectBefore / (normSum || 1),
    normalizationSum: normSum,
  };
}

/**
 * Simulate repeated projective measurements.
 * Each trial: measure ψ (does NOT re-evolve between measurements).
 */
export function repeatedMeasurement(
  psi: ComplexArray,
  basis: MeasurementParams,
  nTrials: number
): RepeatedMeasurementData {
  const { eigenstates, eigenvalues, dx } = basis;
  const nStates = eigenstates.length;

  // Theoretical probabilities
  const theoreticalProbs = new Array<number>(nStates).fill(0);
  let normSum = 0;
  for (let n = 0; n < nStates; n++) {
    const [cRe, cIm] = innerProduct(eigenstates[n], psi, dx);
    theoreticalProbs[n] = cRe * cRe + cIm * cIm;
    normSum += theoreticalProbs[n];
  }
  for (let n = 0; n < nStates; n++) theoreticalProbs[n] /= (normSum || 1);

  // Run trials (no re-evolution = each trial measures same state)
  const histogram = new Array<number>(nStates).fill(0);

  for (let trial = 0; trial < nTrials; trial++) {
    let rng = Math.random();
    let cumulative = 0;
    for (let n = 0; n < nStates; n++) {
      cumulative += theoreticalProbs[n];
      if (rng <= cumulative || n === nStates - 1) {
        histogram[n]++;
        break;
      }
    }
  }

  const frequencies = histogram.map((c) => c / nTrials);

  // Chi-squared goodness of fit
  let chi2 = 0;
  for (let n = 0; n < nStates; n++) {
    const expected = theoreticalProbs[n] * nTrials;
    if (expected > 0.5) {
      chi2 += Math.pow(histogram[n] - expected, 2) / expected;
    }
  }

  return { nTrials, histogram, frequencies, theoreticalProbs, chiSquared: chi2 };
}

/**
 * State reconstruction (quantum state tomography — simplified):
 * Given measurement frequency data from many trials, estimate |cₙ|².
 * Returns reconstructed probability vector.
 */
export function reconstructState(
  frequencies: number[],
  eigenvalues: number[]
): { probs: number[]; reconstructedExpectation: number } {
  const probs = [...frequencies]; // frequencies ≈ |cₙ|²
  let exp = 0;
  for (let n = 0; n < probs.length; n++) exp += probs[n] * eigenvalues[n];
  return { probs, reconstructedExpectation: exp };
}
