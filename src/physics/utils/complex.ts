/**
 * Complex number arithmetic for quantum mechanics computations.
 * Represents complex numbers as [real, imag] pairs for performance.
 */

export type Complex = [number, number];

/** Create a complex number */
export const C = (re: number, im: number = 0): Complex => [re, im];

/** Real part */
export const re = ([r]: Complex): number => r;

/** Imaginary part */
export const im = ([, i]: Complex): number => i;

/** Complex addition */
export const add = ([ar, ai]: Complex, [br, bi]: Complex): Complex => [ar + br, ai + bi];

/** Complex subtraction */
export const sub = ([ar, ai]: Complex, [br, bi]: Complex): Complex => [ar - br, ai - bi];

/** Complex multiplication */
export const mul = ([ar, ai]: Complex, [br, bi]: Complex): Complex => [
  ar * br - ai * bi,
  ar * bi + ai * br,
];

/** Scalar multiplication */
export const scale = ([r, i]: Complex, s: number): Complex => [r * s, i * s];

/** Complex conjugate */
export const conj = ([r, i]: Complex): Complex => [r, -i];

/** Complex modulus squared |z|² */
export const abs2 = ([r, i]: Complex): number => r * r + i * i;

/** Complex modulus |z| */
export const abs = (z: Complex): number => Math.sqrt(abs2(z));

/** Complex argument (phase) arg(z) ∈ [-π, π] */
export const arg = ([r, i]: Complex): number => Math.atan2(i, r);

/** Complex division */
export const div = ([ar, ai]: Complex, [br, bi]: Complex): Complex => {
  const d = br * br + bi * bi;
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
};

/** e^(iθ) */
export const expI = (theta: number): Complex => [Math.cos(theta), Math.sin(theta)];

/** e^z for complex z */
export const exp = ([r, i]: Complex): Complex => {
  const er = Math.exp(r);
  return [er * Math.cos(i), er * Math.sin(i)];
};

/** Complex square root */
export const sqrt = (z: Complex): Complex => {
  const r = abs(z);
  const theta = arg(z);
  return [Math.sqrt(r) * Math.cos(theta / 2), Math.sqrt(r) * Math.sin(theta / 2)];
};

/** Pure imaginary: i * x */
export const iMul = (x: number): Complex => [0, x];

/**
 * Typed array representation for bulk operations.
 * Interleaved format: [re0, im0, re1, im1, ...]
 */
export class ComplexArray {
  readonly data: Float64Array;
  readonly length: number;

  constructor(n: number, init?: (i: number) => Complex) {
    this.length = n;
    this.data = new Float64Array(n * 2);
    if (init) {
      for (let i = 0; i < n; i++) {
        const [r, im] = init(i);
        this.data[2 * i] = r;
        this.data[2 * i + 1] = im;
      }
    }
  }

  get(i: number): Complex {
    return [this.data[2 * i], this.data[2 * i + 1]];
  }

  set(i: number, [r, im]: Complex): void {
    this.data[2 * i] = r;
    this.data[2 * i + 1] = im;
  }

  re(i: number): number { return this.data[2 * i]; }
  im(i: number): number { return this.data[2 * i + 1]; }
  abs2(i: number): number {
    const r = this.data[2 * i], m = this.data[2 * i + 1];
    return r * r + m * m;
  }
  abs(i: number): number { return Math.sqrt(this.abs2(i)); }

  /** Create a copy */
  clone(): ComplexArray {
    const out = new ComplexArray(this.length);
    out.data.set(this.data);
    return out;
  }

  /** ∫|ψ|² dx via trapezoidal rule */
  norm2(dx: number): number {
    let s = 0;
    for (let i = 0; i < this.length; i++) s += this.abs2(i);
    return s * dx;
  }

  /** Normalize in place, returns norm before normalization */
  normalize(dx: number): number {
    const n = Math.sqrt(this.norm2(dx));
    if (n < 1e-30) return 0;
    const inv = 1 / n;
    for (let i = 0; i < this.data.length; i++) this.data[i] *= inv;
    return n;
  }

  /** Convert to plain Float64Array of |ψ|² values */
  toProbabilityDensity(): Float64Array {
    const pd = new Float64Array(this.length);
    for (let i = 0; i < this.length; i++) pd[i] = this.abs2(i);
    return pd;
  }

  /** Convert to real parts array */
  toReArray(): Float64Array {
    const out = new Float64Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.data[2 * i];
    return out;
  }

  /** Convert to imag parts array */
  toImArray(): Float64Array {
    const out = new Float64Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.data[2 * i + 1];
    return out;
  }

  /** Convert to phase array */
  toPhaseArray(): Float64Array {
    const out = new Float64Array(this.length);
    for (let i = 0; i < this.length; i++) {
      out[i] = Math.atan2(this.data[2 * i + 1], this.data[2 * i]);
    }
    return out;
  }
}
