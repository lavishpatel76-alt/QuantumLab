/**
 * CODATA 2018 Physical Constants
 * All values in SI units unless otherwise noted.
 * Source: NIST CODATA 2018 (https://physics.nist.gov/cuu/Constants/)
 */

export interface PhysicalConstants {
  hbar: number;        // Reduced Planck constant [J·s]
  h: number;           // Planck constant [J·s]
  me: number;          // Electron mass [kg]
  mp: number;          // Proton mass [kg]
  e: number;           // Elementary charge [C]
  eps0: number;        // Vacuum permittivity [F/m]
  mu0: number;         // Vacuum permeability [N/A²]
  c: number;           // Speed of light [m/s]
  kB: number;          // Boltzmann constant [J/K]
  alpha: number;       // Fine structure constant [dimensionless]
  a0: number;          // Bohr radius [m]
  Ry: number;          // Rydberg energy [J]
  Eh: number;          // Hartree energy [J]
}

export const CODATA: PhysicalConstants = {
  hbar:  1.054571817e-34,
  h:     6.62607015e-34,
  me:    9.1093837015e-31,
  mp:    1.67262192369e-27,
  e:     1.602176634e-19,
  eps0:  8.8541878128e-12,
  mu0:   1.25663706212e-6,
  c:     299792458,
  kB:    1.380649e-23,
  alpha: 7.2973525693e-3,
  a0:    5.29177210903e-11,  // Bohr radius = ħ/(me·c·α)
  Ry:    2.179872361103542e-18,  // Rydberg = me·e⁴/(8ε₀²h²)
  Eh:    4.3597447222071e-18,    // Hartree = 2 × Rydberg
};

/**
 * Atomic units (internal computation units)
 *  ħ = 1, me = 1, e = 1, 4πε₀ = 1, a₀ = 1, Eh = 1
 * All physics modules compute in atomic units then convert for display.
 */
export const AU = {
  length: CODATA.a0,       // a₀ in meters
  energy: CODATA.Eh,       // Hartree in joules
  time:   CODATA.hbar / CODATA.Eh,  // ħ/Eh in seconds (~24.18 as)
  mass:   CODATA.me,
  charge: CODATA.e,
  // Conversion factors: SI → AU
  toAU: {
    length:  (x: number) => x / CODATA.a0,
    energy:  (x: number) => x / CODATA.Eh,
    time:    (x: number) => x / (CODATA.hbar / CODATA.Eh),
    mass:    (x: number) => x / CODATA.me,
  },
  // Conversion factors: AU → SI
  fromAU: {
    length:  (x: number) => x * CODATA.a0,
    energy:  (x: number) => x * CODATA.Eh,
    time:    (x: number) => x * (CODATA.hbar / CODATA.Eh),
    mass:    (x: number) => x * CODATA.me,
  },
};

/** Mutable constants – allow user override for experimentation */
let _constants: PhysicalConstants = { ...CODATA };

export function getConstants(): PhysicalConstants {
  return _constants;
}

export function overrideConstants(overrides: Partial<PhysicalConstants>): void {
  _constants = { ..._constants, ...overrides };
}

export function resetConstants(): void {
  _constants = { ...CODATA };
}
