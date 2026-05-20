import type { ErrorObject, ValidateFunction } from 'ajv';
import type { ProjectIntegrityIssue, StudioErrorCode } from '@afterimage/project-model';
import type { ValidationIssue, ValidationResult } from './types.js';

export function cloneInput<T>(value: T): T {
  return structuredClone(value);
}

export function mapSchemaIssues(errors: readonly ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    source: 'schema',
    path: error.instancePath || '/',
    message: error.message ?? 'Validation error',
    keyword: error.keyword
  }));
}

export function mapIntegrityIssues(issues: ProjectIntegrityIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    source: 'integrity',
    path: issue.path,
    message: issue.message,
    keyword: issue.code
  }));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateWithSchema<TInput, TOutput = TInput>(
  validator: ValidateFunction<TInput>,
  input: unknown,
  normalize: (value: TInput) => TOutput,
  code: StudioErrorCode
): ValidationResult<TOutput> {
  const candidate = cloneInput(input);

  if (!validator(candidate)) {
    return {
      ok: false,
      code,
      errors: mapSchemaIssues(validator.errors)
    };
  }

  return {
    ok: true,
    value: normalize(candidate as TInput)
  };
}
