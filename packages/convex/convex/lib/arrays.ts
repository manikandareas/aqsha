/**
 * Pure array helpers shared across providers and extraction modules.
 */

/** Normalise a possibly-single, possibly-nullish value into an array. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
