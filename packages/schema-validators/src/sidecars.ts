import {
  collectArchiveIntegrityIssues,
  normalizeAnalysisFile,
  normalizeArchiveMetadataFile,
  normalizeMidiMappingFile,
  normalizePreset,
  normalizeSequence,
  type AnalysisFile,
  type ArchiveMetadataFile,
  type MidiMappingFile,
  type NormalizedArchiveMetadataFile,
  type Preset,
  type Sequence
} from '@afterimage/project-model';
import {
  analysisValidator,
  archiveValidator,
  midiMappingValidator,
  presetValidator,
  sequenceValidator
} from './ajv.js';
import { mapIntegrityIssues, validateWithSchema } from './utils.js';
import { ValidationError, type ValidationResult } from './types.js';

export function validatePreset(input: unknown): ValidationResult<Preset> {
  return validateWithSchema(presetValidator, input, normalizePreset, 'schema-validation-failure');
}

export function parsePreset(input: unknown): Preset {
  const result = validatePreset(input);

  if (!result.ok) {
    throw new ValidationError('Preset validation failed.', result.code, result.errors);
  }

  return result.value;
}

export function assertPreset(input: unknown): asserts input is Preset {
  parsePreset(input);
}

export function validateSequence(input: unknown): ValidationResult<Sequence> {
  return validateWithSchema(sequenceValidator, input, normalizeSequence, 'schema-validation-failure');
}

export function parseSequence(input: unknown): Sequence {
  const result = validateSequence(input);

  if (!result.ok) {
    throw new ValidationError('Sequence validation failed.', result.code, result.errors);
  }

  return result.value;
}

export function assertSequence(input: unknown): asserts input is Sequence {
  parseSequence(input);
}

export function validateAnalysis(input: unknown): ValidationResult<AnalysisFile> {
  return validateWithSchema(analysisValidator, input, normalizeAnalysisFile, 'schema-validation-failure');
}

export function parseAnalysis(input: unknown): AnalysisFile {
  const result = validateAnalysis(input);

  if (!result.ok) {
    throw new ValidationError('Analysis validation failed.', result.code, result.errors);
  }

  return result.value;
}

export function assertAnalysis(input: unknown): asserts input is AnalysisFile {
  parseAnalysis(input);
}

export function validateArchiveMetadata(input: unknown): ValidationResult<NormalizedArchiveMetadataFile> {
  const result = validateWithSchema(archiveValidator, input, normalizeArchiveMetadataFile, 'schema-validation-failure');

  if (!result.ok) {
    return result;
  }

  const integrityIssues = collectArchiveIntegrityIssues(result.value);
  if (integrityIssues.length > 0) {
    return {
      ok: false,
      code: 'invalid-archive-file',
      errors: mapIntegrityIssues(integrityIssues)
    };
  }

  return result;
}

export function parseArchiveMetadata(input: unknown): NormalizedArchiveMetadataFile {
  const result = validateArchiveMetadata(input);

  if (!result.ok) {
    throw new ValidationError('Archive metadata validation failed.', result.code, result.errors);
  }

  return result.value;
}

export function assertArchiveMetadata(input: unknown): asserts input is ArchiveMetadataFile {
  parseArchiveMetadata(input);
}

export function validateMidiMapping(input: unknown): ValidationResult<MidiMappingFile> {
  return validateWithSchema(midiMappingValidator, input, normalizeMidiMappingFile, 'schema-validation-failure');
}

export function parseMidiMapping(input: unknown): MidiMappingFile {
  const result = validateMidiMapping(input);

  if (!result.ok) {
    throw new ValidationError('MIDI mapping validation failed.', result.code, result.errors);
  }

  return result.value;
}

export function assertMidiMapping(input: unknown): asserts input is MidiMappingFile {
  parseMidiMapping(input);
}
