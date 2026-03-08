import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import {
  CURRENT_PROJECT_VERSION,
  collectProjectIntegrityIssues,
  createEmptyProject,
  normalizeAnalysisFile,
  normalizeMidiMappingFile,
  normalizePreset,
  normalizeProject,
  normalizeSequence,
  slugify,
  type AnalysisFile,
  type CutCandidate,
  type MediaType,
  type MidiMappingFile,
  type NormalizedProjectFile,
  type Preset,
  type ProjectFile,
  type ProjectIntegrityIssue,
  type Sequence,
  type StudioErrorCode
} from '@afterimage/project-model';
import sharedDefsSchema from '../../../schemas/shared-defs.schema.json' with { type: 'json' };
import projectSchema from '../../../schemas/project.schema.json' with { type: 'json' };
import presetSchema from '../../../schemas/preset.schema.json' with { type: 'json' };
import sequenceSchema from '../../../schemas/sequence.schema.json' with { type: 'json' };
import analysisSchema from '../../../schemas/analysis.schema.json' with { type: 'json' };
import midiMappingSchema from '../../../schemas/midi-mapping.schema.json' with { type: 'json' };

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

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  useDefaults: true
});

ajv.addSchema(sharedDefsSchema);

export const projectValidator = ajv.compile<ProjectFile>(projectSchema);
export const presetValidator = ajv.compile<Preset>(presetSchema);
export const sequenceValidator = ajv.compile<Sequence>(sequenceSchema);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function basenameFromPath(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value;
}

function inferMediaType(path: string, hasVideo = true, hasAudio = true): MediaType {
  const lower = path.toLowerCase();

  if (/\.(png|jpg|jpeg|webp|gif)$/i.test(lower)) {
    return 'image';
  }

  if (!hasVideo && hasAudio || /\.(wav|mp3|aif|aiff|flac|m4a)$/i.test(lower)) {
    return 'audio';
  }

  return 'video';
}

function buildLegacyCutIds(sequence: { items?: Array<{ id: string }> } | undefined): Set<string> {
  return new Set((sequence?.items ?? []).map((item) => `cut-${item.id}`));
}

function migrateLegacyProject(input: Record<string, unknown>): ProjectMigrationResult {
  const id = String(input.id ?? 'project-migrated');
  const name = String(input.name ?? 'Migrated Project');
  const baseProject = createEmptyProject({
    id,
    name,
    mode: input.mode === 'live-desktop' || input.mode === 'live-appliance' ? input.mode : 'studio',
    description: typeof input.description === 'string' ? input.description : undefined
  });
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const presets = Array.isArray(input.presets) ? input.presets : [];
  const midiMappings = Array.isArray(input.midiMappings) ? input.midiMappings : [];
  const legacyAnalysisRefs = Array.isArray(input.analysisRefs) ? input.analysisRefs : [];
  const legacySequence = isRecord(input.sequence) ? input.sequence : undefined;
  const notes: string[] = ['Migrated from Phase 1 project shape.'];
  const legacyCutIds = buildLegacyCutIds(legacySequence as { items?: Array<{ id: string }> } | undefined);

  const assets = sources
    .filter(isRecord)
    .map((source) => {
      const path = String(source.path ?? '');
      const hasVideo = source.hasVideo !== false;
      const hasAudio = source.hasAudio !== false;

      return {
        id: String(source.id ?? (slugify(basenameFromPath(path)) || 'asset')),
        filename: basenameFromPath(path),
        mediaType: inferMediaType(path, hasVideo, hasAudio),
        path: {
          absolutePath: path
        },
        label: typeof source.label === 'string' ? source.label : undefined,
        hasAudio,
        importStatus: 'ready' as const,
        analysisStatus: legacyAnalysisRefs.some((ref) => isRecord(ref) && String(ref.sourceId ?? '') === String(source.id ?? ''))
          ? 'completed' as const
          : 'pending' as const,
        tags: []
      };
    });

  const cutCandidates: CutCandidate[] = [];
  const variants = legacySequence ? [
    {
      id: 'variant-main',
      sequenceId: String(legacySequence.id ?? 'sequence-main'),
      name: 'Assembly A',
      clips: Array.isArray(legacySequence.items)
        ? legacySequence.items.filter(isRecord).map((item) => {
          const clipId = String(item.id ?? 'clip');
          const sourceId = String(item.sourceId ?? '');
          const durationMs = Number(item.durationMs ?? 1000);
          const sourceStartMs = Number(item.sourceStartMs ?? 0);
          const cutId = `cut-${clipId}`;

          cutCandidates.push({
            id: cutId,
            assetId: sourceId,
            startMs: sourceStartMs,
            endMs: sourceStartMs + durationMs,
            durationMs,
            status: 'kept',
            favorite: false,
            tags: []
          });

          return {
            id: clipId,
            assetId: sourceId,
            cutId,
            timelineStartMs: Number(item.timelineStartMs ?? 0),
            sourceStartMs,
            durationMs,
            presetId: typeof item.presetId === 'string' ? item.presetId : undefined,
            transition: 'cut' as const,
            tags: []
          };
        })
        : [],
      favorite: true,
      assistedGeneration: {
        strategy: 'manual' as const
      },
      markers: [],
      sections: []
    }
  ] : baseProject.variants;

  const sequences = legacySequence ? [
    {
      id: String(legacySequence.id ?? 'sequence-main'),
      name: String(legacySequence.name ?? 'Main Sequence'),
      variantIds: ['variant-main'],
      defaultVariantId: 'variant-main',
      favorite: true
    }
  ] : baseProject.sequences;

  const migrated = normalizeProject({
    ...baseProject,
    description: typeof input.description === 'string' ? input.description : baseProject.description,
    presets: presets.filter(isRecord).map((preset) => ({
      id: String(preset.id ?? 'preset'),
      name: String(preset.name ?? 'Preset'),
      family: preset.family === 'liminal' || preset.family === 'imagined-futures' || preset.family === 'glitch' ? preset.family : 'vhs',
      filters: Array.isArray(preset.filters)
        ? preset.filters.filter(isRecord).map((filter) => ({
          type: String(filter.type ?? 'tracking-wobble'),
          amount: Number(filter.amount ?? 0),
          mix: typeof filter.mix === 'number' ? filter.mix : undefined,
          seed: typeof filter.seed === 'number' ? filter.seed : undefined
        }))
        : []
    })),
    assets,
    analysisRefs: legacyAnalysisRefs.filter(isRecord).map((ref) => ({
      id: String(ref.id ?? 'analysis'),
      assetId: String(ref.sourceId ?? ref.assetId ?? ''),
      path: String(ref.path ?? ''),
      summary: isRecord(ref.summary)
        ? {
            sceneCount: Number(ref.summary.sceneCount ?? 0),
            durationMs: typeof ref.summary.durationMs === 'number' ? ref.summary.durationMs : undefined
          }
        : undefined
    })),
    cutCandidates,
    sequences,
    variants,
    midiMappings: midiMappings.filter(isRecord).map((mapping) => ({
      id: String(mapping.id ?? 'midi'),
      name: String(mapping.name ?? 'Legacy MIDI'),
      bindings: Array.isArray(mapping.bindings)
        ? mapping.bindings.filter(isRecord).map((binding) => ({
          id: String(binding.id ?? 'binding'),
          source: String(binding.source ?? ''),
          target: String(binding.target ?? ''),
          mode: binding.mode === 'set' || binding.mode === 'toggle' || binding.mode === 'scale' ? binding.mode : 'trigger'
        }))
        : []
    })),
    metadata: {
      ...baseProject.metadata,
      currentProfileSet: 'legacy-migrated'
    }
  });

  if (legacyCutIds.size > 0) {
    notes.push(`Created ${legacyCutIds.size} kept cut candidates from legacy sequence items.`);
  }

  return {
    migrated: true,
    fromVersion: 1,
    project: migrated,
    notes
  };
}

function coerceProjectInput(input: unknown): { candidate: unknown; migrated: boolean; fromVersion: number; notes: string[] } {
  if (!isRecord(input)) {
    return {
      candidate: input,
      migrated: false,
      fromVersion: 0,
      notes: []
    };
  }

  const version = typeof input.version === 'number' ? input.version : 0;
  const looksLegacy = 'sources' in input || 'sequence' in input;

  if (version < CURRENT_PROJECT_VERSION || looksLegacy) {
    const migration = migrateLegacyProject(input);
    return {
      candidate: migration.project,
      migrated: migration.migrated,
      fromVersion: migration.fromVersion,
      notes: migration.notes
    };
  }

  return {
    candidate: cloneInput(input),
    migrated: false,
    fromVersion: version,
    notes: []
  };
}

function validateWithSchema<TInput, TOutput = TInput>(
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

export function loadProject(input: unknown): ProjectMigrationResult {
  const { candidate, migrated, fromVersion, notes } = coerceProjectInput(input);
  const result = validateWithSchema(projectValidator, candidate, normalizeProject, 'schema-validation-failure');

  if (!result.ok) {
    throw new ValidationError('Project validation failed.', result.code, result.errors);
  }

  const integrityIssues = collectProjectIntegrityIssues(result.value);
  if (integrityIssues.length > 0) {
    throw new ValidationError('Project integrity validation failed.', 'invalid-project-file', mapIntegrityIssues(integrityIssues));
  }

  return {
    migrated,
    fromVersion,
    project: result.value,
    notes
  };
}

export function validateProject(input: unknown): ValidationResult<NormalizedProjectFile> {
  try {
    const loaded = loadProject(input);
    return {
      ok: true,
      value: loaded.project,
      migrated: loaded.migrated,
      fromVersion: loaded.fromVersion
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        ok: false,
        code: error.code,
        errors: error.issues
      };
    }

    return {
      ok: false,
      code: 'migration-failure',
      errors: [
        {
          source: 'migration',
          path: '/',
          message: error instanceof Error ? error.message : 'Unknown project migration failure',
          keyword: 'migration-failure'
        }
      ]
    };
  }
}

export function parseProject(input: unknown): NormalizedProjectFile {
  return loadProject(input).project;
}

export function assertProject(input: unknown): asserts input is ProjectFile {
  parseProject(input);
}

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
