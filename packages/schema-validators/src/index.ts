import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';
import {
  collectProjectIntegrityIssues,
  normalizeAnalysisFile,
  normalizeMidiMappingFile,
  normalizePreset,
  normalizeProject,
  normalizeSequence,
  type AnalysisFile,
  type MidiMappingFile,
  type NormalizedProjectFile,
  type Preset,
  type ProjectFile,
  type ProjectIntegrityIssue,
  type ProjectSequence
} from '@afterimage/project-model';
import sharedDefsSchema from '../../../schemas/shared-defs.schema.json';
import projectSchema from '../../../schemas/project.schema.json';
import presetSchema from '../../../schemas/preset.schema.json';
import sequenceSchema from '../../../schemas/sequence.schema.json';
import analysisSchema from '../../../schemas/analysis.schema.json';
import midiMappingSchema from '../../../schemas/midi-mapping.schema.json';

export interface ValidationIssue {
  source: 'schema' | 'integrity';
  path: string;
  message: string;
  keyword?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationIssue[] };

export class ValidationError extends Error {
  constructor(message: string, readonly issues: ValidationIssue[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  useDefaults: true
});

ajv.addSchema(sharedDefsSchema);

export const projectValidator = ajv.compile<ProjectFile>(projectSchema);
export const presetValidator = ajv.compile<Preset>(presetSchema);
export const sequenceValidator = ajv.compile<ProjectSequence>(sequenceSchema);
export const analysisValidator = ajv.compile<AnalysisFile>(analysisSchema);
export const midiMappingValidator = ajv.compile<MidiMappingFile>(midiMappingSchema);

function cloneInput<T>(value: T): T {
  return structuredClone(value);
}

function mapSchemaIssues(errors: readonly ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    source: 'schema',
    path: error.instancePath || '/',
    message: error.message ?? 'Validation error',
    keyword: error.keyword
  }));
}

function mapIntegrityIssues(issues: ProjectIntegrityIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    source: 'integrity',
    path: issue.path,
    message: issue.message,
    keyword: issue.code
  }));
}

function validateWithSchema<TInput, TOutput = TInput>(
  validator: ValidateFunction<TInput>,
  input: unknown,
  normalize: (value: TInput) => TOutput
): ValidationResult<TOutput> {
  const candidate = cloneInput(input);

  if (!validator(candidate)) {
    return {
      ok: false,
      errors: mapSchemaIssues(validator.errors)
    };
  }

  return {
    ok: true,
    value: normalize(candidate as TInput)
  };
}

export function validateProject(input: unknown): ValidationResult<NormalizedProjectFile> {
  const result = validateWithSchema(projectValidator, input, normalizeProject);
  if (!result.ok) {
    return result;
  }

  const integrityIssues = collectProjectIntegrityIssues(result.value);
  if (integrityIssues.length > 0) {
    return {
      ok: false,
      errors: mapIntegrityIssues(integrityIssues)
    };
  }

  return result;
}

export function parseProject(input: unknown): NormalizedProjectFile {
  const result = validateProject(input);

  if (!result.ok) {
    throw new ValidationError('Project validation failed.', result.errors);
  }

  return result.value;
}

export function assertProject(input: unknown): asserts input is ProjectFile {
  parseProject(input);
}

export function validatePreset(input: unknown): ValidationResult<Preset> {
  return validateWithSchema(presetValidator, input, normalizePreset);
}

export function parsePreset(input: unknown): Preset {
  const result = validatePreset(input);

  if (!result.ok) {
    throw new ValidationError('Preset validation failed.', result.errors);
  }

  return result.value;
}

export function assertPreset(input: unknown): asserts input is Preset {
  parsePreset(input);
}

export function validateSequence(input: unknown): ValidationResult<ProjectSequence> {
  return validateWithSchema(sequenceValidator, input, normalizeSequence);
}

export function parseSequence(input: unknown): ProjectSequence {
  const result = validateSequence(input);

  if (!result.ok) {
    throw new ValidationError('Sequence validation failed.', result.errors);
  }

  return result.value;
}

export function assertSequence(input: unknown): asserts input is ProjectSequence {
  parseSequence(input);
}

export function validateAnalysis(input: unknown): ValidationResult<AnalysisFile> {
  return validateWithSchema(analysisValidator, input, normalizeAnalysisFile);
}

export function parseAnalysis(input: unknown): AnalysisFile {
  const result = validateAnalysis(input);

  if (!result.ok) {
    throw new ValidationError('Analysis validation failed.', result.errors);
  }

  return result.value;
}

export function assertAnalysis(input: unknown): asserts input is AnalysisFile {
  parseAnalysis(input);
}

export function validateMidiMapping(input: unknown): ValidationResult<MidiMappingFile> {
  return validateWithSchema(midiMappingValidator, input, normalizeMidiMappingFile);
}

export function parseMidiMapping(input: unknown): MidiMappingFile {
  const result = validateMidiMapping(input);

  if (!result.ok) {
    throw new ValidationError('MIDI mapping validation failed.', result.errors);
  }

  return result.value;
}

export function assertMidiMapping(input: unknown): asserts input is MidiMappingFile {
  parseMidiMapping(input);
}
