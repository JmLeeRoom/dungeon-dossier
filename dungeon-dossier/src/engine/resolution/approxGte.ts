export const EPSILON = 1e-9;

export function approxGte(a: number, b: number, epsilon = EPSILON): boolean {
  return a > b || Math.abs(a - b) <= epsilon;
}

