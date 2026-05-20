import type { NormalizedProjectFile, StudioErrorCode } from '@afterimage/project-model';

export interface ValidationIssue {
  source: 'schema' | 'integrity' | 'migration';
  path: string;
  message: string;
  keyword?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; migrated?: boolean; fromVersion?: number }
  | { ok: false; errors: ValidationIssue[]; code: StudioErrorCode };

export interface ProjectMigrationResult {
  migrated: boolean;
  fromVersion: number;
  project: NormalizedProjectFile;
  notes: string[];
}

export class ValidationError extends Error {
  constructor(message: string, readonly code: StudioErrorCode, readonly issues: ValidationIssue[]) {
    super(message);
    this.name = 'ValidationError';
  }
}
