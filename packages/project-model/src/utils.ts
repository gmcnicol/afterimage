import type { JsonPrimitive } from './types.js';

export function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

export function compareNumbers(left: number, right: number): number {
  return left - right;
}

export function normalizeBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return value ?? fallback;
}

export function normalizeNumber(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

export function normalizeStringArray(value: string[] | undefined): string[] {
  return [...new Set(value ?? [])].sort(compareStrings);
}

export function normalizeSortedStringArray(value: string[] | undefined): string[] {
  return [...(value ?? [])].sort(compareStrings);
}

export function clampUnit(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

export function normalizeUnit(value: number | undefined, fallback: number): number {
  return clampUnit(value) ?? fallback;
}

export function normalizeJsonRecord(record: Record<string, JsonPrimitive> | undefined): Record<string, JsonPrimitive> {
  return Object.fromEntries(Object.entries(record ?? {}).sort(([left], [right]) => compareStrings(left, right)));
}

export function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => compareStrings(left.id, right.id));
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
