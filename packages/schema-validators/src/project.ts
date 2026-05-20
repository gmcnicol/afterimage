import {
  CURRENT_PROJECT_VERSION,
  collectProjectIntegrityIssues,
  createEmptyProject,
  normalizeProject,
  slugify,
  type CutCandidate,
  type MediaType,
  type NormalizedProjectFile,
  type ProjectFile
} from '@afterimage/project-model';
import { projectValidator } from './ajv.js';
import { cloneInput, isRecord, mapIntegrityIssues, validateWithSchema } from './utils.js';
import { ValidationError, type ProjectMigrationResult, type ValidationResult } from './types.js';

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

function looksLikeCurrentProjectShape(input: Record<string, unknown>): boolean {
  return Array.isArray(input.assets)
    && Array.isArray(input.sequences)
    && Array.isArray(input.variants);
}

const legacyFilterTypeMap: Record<string, string> = {
  'tracking-wobble': 'blur',
  'fluorescent-flicker': 'brightness',
  'desaturation-lfo': 'brightness',
  'contrast-pulse': 'contrast'
};

function upgradeFilterType(type: unknown): string {
  if (typeof type !== 'string') {
    return 'contrast';
  }

  return legacyFilterTypeMap[type] ?? type;
}

function getPrimaryPropertyForFilterType(type: string): string {
  switch (type) {
    case 'contrast':
      return 'contrast';
    case 'brightness':
      return 'brightness';
    case 'blur':
      return 'radius';
    case 'bloom-soft':
    case 'glitch-bands':
    case 'chroma-bleed':
      return 'strength';
    default:
      return 'strength';
  }
}

function upgradeFilterParameters(type: string, parameters: unknown): Record<string, unknown> | undefined {
  if (!isRecord(parameters)) {
    return undefined;
  }

  const next = { ...parameters };
  const primaryProperty = getPrimaryPropertyForFilterType(type);

  if (typeof next.amount === 'number' && next[primaryProperty] === undefined) {
    next[primaryProperty] = next.amount;
  }

  if (typeof next.blur === 'number' && next.radius === undefined) {
    next.radius = next.blur;
  }

  if ((typeof next.bloom === 'number' || typeof next.chromaOffset === 'number' || typeof next.glitch === 'number') && next.strength === undefined) {
    next.strength = next.bloom ?? next.chromaOffset ?? next.glitch;
  }

  delete next.amount;
  delete next.blur;
  delete next.bloom;
  delete next.chromaOffset;
  delete next.glitch;

  return next;
}

function upgradeAutomationProperty(filterType: string, property: unknown): string {
  if (property === 'mix') {
    return 'mix';
  }

  if (property === 'contrast' || property === 'brightness' || property === 'radius' || property === 'strength') {
    return property;
  }

  switch (property) {
    case 'amount':
      return getPrimaryPropertyForFilterType(filterType);
    case 'blur':
      return 'radius';
    case 'bloom':
    case 'chromaOffset':
    case 'glitch':
      return 'strength';
    default:
      return getPrimaryPropertyForFilterType(filterType);
  }
}

function upgradeCurrentProjectShape(input: Record<string, unknown>): { candidate: Record<string, unknown>; migrated: boolean; notes: string[] } {
  const candidate = cloneInput(input);
  const notes: string[] = [];
  let migrated = false;

  if (Array.isArray(candidate.presets)) {
    candidate.presets = candidate.presets.map((preset) => {
      if (!isRecord(preset) || !Array.isArray(preset.filters)) {
        return preset;
      }

      return {
        ...preset,
        filters: preset.filters.map((filter) => {
          if (!isRecord(filter)) {
            return filter;
          }
          const upgradedType = upgradeFilterType(filter.type);
          if (upgradedType !== filter.type) {
            migrated = true;
          }
          return {
            ...filter,
            type: upgradedType
          };
        })
      };
    });
  }

  const filterTypeById = new Map<string, string>();
  if (Array.isArray(candidate.filterStacks)) {
    candidate.filterStacks = candidate.filterStacks.map((stack) => {
      if (!isRecord(stack) || !Array.isArray(stack.filters)) {
        return stack;
      }

      return {
        ...stack,
        filters: stack.filters.map((filter) => {
          if (!isRecord(filter)) {
            return filter;
          }

          const upgradedType = upgradeFilterType(filter.type);
          const upgradedParameters = upgradeFilterParameters(upgradedType, filter.parameters);
          if (upgradedType !== filter.type || upgradedParameters !== filter.parameters) {
            migrated = true;
          }
          if (typeof filter.id === 'string') {
            filterTypeById.set(filter.id, upgradedType);
          }

          return {
            ...filter,
            type: upgradedType,
            parameters: upgradedParameters
          };
        })
      };
    });
  }

  if (Array.isArray(candidate.automationLanes)) {
    candidate.automationLanes = candidate.automationLanes.map((lane) => {
      if (!isRecord(lane) || !isRecord(lane.target)) {
        return lane;
      }

      const filterId = typeof lane.target.filterId === 'string' ? lane.target.filterId : '';
      const filterType = filterTypeById.get(filterId) ?? 'contrast';
      const upgradedProperty = upgradeAutomationProperty(filterType, lane.target.property);
      if (upgradedProperty !== lane.target.property) {
        migrated = true;
      }

      return {
        ...lane,
        target: {
          ...lane.target,
          property: upgradedProperty
        }
      };
    });
  }

  if (migrated) {
    notes.push('Upgraded legacy style and automation contracts to the current supported filter model.');
  }

  return {
    candidate,
    migrated,
    notes
  };
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
          type: String(filter.type ?? 'blur'),
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
  const looksCurrentShape = looksLikeCurrentProjectShape(input);

  if (looksLegacy) {
    const migration = migrateLegacyProject(input);
    return {
      candidate: migration.project,
      migrated: migration.migrated,
      fromVersion: migration.fromVersion,
      notes: migration.notes
    };
  }

  if (looksCurrentShape) {
    const upgraded = upgradeCurrentProjectShape(input);
    const shouldBumpVersion = version < CURRENT_PROJECT_VERSION;
    return {
      candidate: {
        ...upgraded.candidate,
        version: shouldBumpVersion ? CURRENT_PROJECT_VERSION : version
      },
      migrated: upgraded.migrated || shouldBumpVersion,
      fromVersion: version,
      notes: [
        ...(shouldBumpVersion ? ['Updated project version to the current canonical schema.'] : []),
        ...upgraded.notes
      ]
    };
  }

  return {
    candidate: cloneInput(input),
    migrated: false,
    fromVersion: version,
    notes: []
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
