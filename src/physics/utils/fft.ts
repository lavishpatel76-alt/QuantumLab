/**
 * Fast Fourier Transform (FFT) implementation.
 * Cooley-Tukey radix-2 DIT algorithm, in-place, power-of-2 arrays.
 * Operates on ComplexArray (interleaved Float64Array).
 */

import { ComplexArray } from './complex';

/** Bit-reverse permutation in-place */
function bitReverse(arr: Float64Array, n: number): void {
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      // Swap real and imag
      let t = arr[2 * i]; arr[2 * i] = arr[2 * j]; arr[2 * j] = t;
      t = arr[2 * i + 1]; arr[2 * i + 1] = arr[2 * j + 1]; arr[2 * j + 1] = t;
    }
  }
}

/**
 * In-place FFT on ComplexArray.
 * @param ca  ComplexArray of length n (must be power of 2)
 * @param inv true → inverse FFT (IFFT), false → forward FFT
 */
export function fft(ca: ComplexArray, inv: boolean = false): void {
  const n = ca.length;
  const data = ca.data;

  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT requires power-of-2 length, got ${n}`);
  }

  bitReverse(data, n);

  const sign = inv ? 1 : -1;

  for (let len = 2; len <= n; len <<= 1) {
    const ang = sign * 2 * Math.PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = data[2 * (i + j)];
        const uIm = data[2 * (i + j) + 1];
        const vRe = data[2 * (i + j + len / 2)] * curRe - data[2 * (i + j + len / 2) + 1] * curIm;
        const vIm = data[2 * (i + j + len / 2)] * curIm + data[2 * (i + j + len / 2) + 1] * curRe;
        data[2 * (i + j)] = uRe + vRe;
        data[2 * (i + j) + 1] = uIm + vIm;
        data[2 * (i + j + len / 2)] = uRe - vRe;
        data[2 * (i + j + len / 2) + 1] = uIm - vIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }

  if (inv) {
    for (let i = 0; i < data.length; i++) data[i] /= n;
  }
}

/**
 * FFT-shift: move zero-frequency component to center.
 * Equivalent to numpy.fft.fftshift.
 */
export function fftShift(ca: ComplexArray): ComplexArray {
  const n = ca.length;
  const half = Math.floor(n / 2);
  const out = new ComplexArray(n);
  for (let i = 0; i < n; i++) {
    const j = (i + half) % n;
    out.data[2 * i] = ca.data[2 * j];
    out.data[2 * i + 1] = ca.data[2 * j + 1];
  }
  return out;
}

/**
 * Compute k-space frequencies for a grid of n points with spacing dx.
 * Returns array of k values (angular frequency) in range [-π/dx, π/dx].
 */
export function kFrequencies(n: number, dx: number): Float64Array {
  const dk = (2 * Math.PI) / (n * dx);
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // FFT order: 0, 1, ..., n/2-1, -n/2, ..., -1
    k[i] = i < n / 2 ? i * dk : (i - n) * dk;
  }
  return k;
}

/**
 * 2D FFT: performs row-then-column FFT on a 2D complex grid stored as
 * ComplexArray in row-major order (length = nx * ny).
 */
export function fft2D(ca: ComplexArray, nx: number, ny: number, inv: boolean = false): void {
  // Row FFTs
  for (let row = 0; row < nx; row++) {
    const rowArr = new ComplexArray(ny, (j) => ca.get(row * ny + j));
    fft(rowArr, inv);
    for (let j = 0; j < ny; j++) ca.set(row * ny + j, rowArr.get(j));
  }
  // Column FFTs
  for (let col = 0; col < ny; col++) {
    const colArr = new ComplexArray(nx, (i) => ca.get(i * ny + col));
    fft(colArr, inv);
    for (let i = 0; i < nx; i++) ca.set(i * ny + col, colArr.get(i));
  }
}
