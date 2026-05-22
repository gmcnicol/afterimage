import { createHash } from 'node:crypto';
import type {
  RenderGraphCacheIdentity,
  RenderGraphProvenance
} from './types.js';

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

export function hashIdentity(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function createCacheIdentity(
  namespace: string,
  inputs: string[],
  value: unknown,
  invalidatesOn: string[],
  provenance: RenderGraphProvenance
): RenderGraphCacheIdentity {
  return {
    namespace,
    key: hashIdentity(value),
    version: 1,
    algorithm: 'sha256',
    inputs,
    status: 'derived',
    invalidatesOn,
    provenance
  };
}
