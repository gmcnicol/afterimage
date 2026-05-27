import { watchFile } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import type { Dialog, Shell } from 'electron';
import { executeCommandSpec, resolveFfmpegTools } from '@afterimage/ffmpeg-compiler';
import { parseFfprobeOutput } from '@afterimage/media-analysis';
import * as domainOps from '@afterimage/domain-operations';
import { loadPresetLibrary } from '@afterimage/preset-library';
import {
  createEmptyProject,
  getDefaultFilterParameters,
  getFilterDefinition,
  getPrimaryAutomationProperty,
  normalizeProjectPathRef,
  slugify,
  type AssetRole,
  type Marker,
  type MediaAsset,
  type ProjectPathRef
} from '@afterimage/project-model';
import { parseAnalysis, parseArchiveMetadata, parseProject, ValidationError } from '@afterimage/schema-validators';
import type {
  ArchiveSidecarImportResult,
  ArchiveSidecarListRequest,
  ArchiveSidecarListResult,
  ArchiveSidecarLoadError,
  ArchiveSidecarLoadResult,
  ImportCueFileResult,
  ProjectMaterializeAnalysisCutsRequest,
  ProjectMutationResult,
  ProjectOperation,
  ProjectSessionSnapshot,
  RelinkAssetResult,
  SaveProjectRequest
} from '@afterimage/studio-contracts';
import type { Logger } from './logger.js';

interface ProjectServiceOptions {
  dialog: Dialog;
  shell: Shell;
  logger: Logger;
  recentProjectsPath: string;
  onRecentProjectsChanged?: (recentProjects: string[]) => void;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function inferMediaType(filePath: string, kind: 'media' | 'music' | 'transition-mask' | 'transition-overlay'): MediaAsset['mediaType'] {
  const lower = filePath.toLowerCase();
  if (kind === 'music' || /\.(wav|mp3|aif|aiff|flac|m4a)$/i.test(lower)) {
    return 'audio';
  }
  if (/\.(png|jpg|jpeg|webp|gif)$/i.test(lower)) {
    return 'image';
  }
  return 'video';
}

function buildPathRef(projectRoot: string, absolutePath: string): ProjectPathRef {
  const nextRelative = relative(projectRoot, absolutePath);
  return normalizeProjectPathRef({
    absolutePath,
    relativePath: nextRelative.startsWith('..') ? undefined : nextRelative.replace(/\\/g, '/')
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectProjectEntityIds(project: ProjectSessionSnapshot['project']): Set<string> {
  return new Set([
    project.id,
    ...project.assets.map((asset) => asset.id),
    ...project.presets.map((preset) => preset.id),
    ...project.analysisRefs.map((ref) => ref.id),
    ...project.cutCandidates.map((cut) => cut.id),
    ...project.bins.map((bin) => bin.id),
    ...project.sequences.map((sequence) => sequence.id),
    ...project.variants.map((variant) => variant.id),
    ...project.variants.flatMap((variant) => [
      ...(variant.clips ?? []).map((clip) => clip.id),
      ...(variant.markers ?? []).map((marker) => marker.id),
      ...(variant.sections ?? []).map((section) => section.id)
    ]).flat(),
    ...project.filterStacks.map((stack) => stack.id),
    ...project.filterStacks.flatMap((stack) => stack.filters.map((filter) => filter.id)),
    ...project.automationLanes.map((lane) => lane.id),
    ...project.automationLanes.flatMap((lane) => lane.keyframes.map((keyframe) => keyframe.id)),
    ...project.midiMappings.map((mapping) => mapping.id)
  ]);
}

function createProjectEntityId(project: ProjectSessionSnapshot['project'], prefix: string): string {
  const ids = collectProjectEntityIds(project);
  const baseId = `${prefix}-${Date.now()}`;

  if (!ids.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (ids.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function parseCueKind(value: unknown): Marker['kind'] {
  if (value === 'beat' || value === 'chapter' || value === 'marker') {
    return value;
  }
  return 'marker';
}

function parseCueTimeMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value);
}

function parseAfterimageCueFile(raw: string): Marker[] {
  const parsed = JSON.parse(raw) as unknown;
  const cues = isRecord(parsed) && Array.isArray(parsed.cues) ? parsed.cues : undefined;
  if (!cues) {
    throw new Error('Cue file must be JSON with a "cues" array.');
  }

  const markers = cues.map((cue, index): Marker | undefined => {
    if (!isRecord(cue)) {
      return undefined;
    }

    const timeMs = parseCueTimeMs(cue.timeMs);
    if (timeMs === undefined) {
      return undefined;
    }

    const label = typeof cue.label === 'string' && cue.label.trim()
      ? cue.label.trim()
      : `Cue ${index + 1}`;
    const kind = parseCueKind(cue.kind);
    return {
      id: `custom-cue-${index + 1}-${stableHash(`${timeMs}:${label}:${kind}`)}`,
      timeMs,
      label,
      kind
    };
  }).filter((marker): marker is Marker => Boolean(marker));

  if (markers.length === 0) {
    throw new Error('Cue file did not contain any valid cues.');
  }

  return markers.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
}

async function ensureProjectStructure(projectRoot: string): Promise<void> {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'archive'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'analysis'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'thumbnails'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'waveforms'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'preview'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'logs'), { recursive: true }),
    mkdir(join(projectRoot, 'exports'), { recursive: true })
  ]);
}

const archiveSidecarRoots = [
  join('.afterimage', 'archive'),
  'archive',
  'archives'
] as const;

function formatSidecarLoadError(error: unknown): ArchiveSidecarLoadError {
  if (error instanceof ValidationError) {
    return {
      message: error.message,
      code: error.code,
      details: error.issues.map((issue) => `${issue.path}: ${issue.message}`)
    };
  }

  return {
    message: getErrorMessage(error)
  };
}

async function collectArchiveSidecarPaths(directoryPath: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await collectArchiveSidecarPaths(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.archive.json')) {
      paths.push(entryPath);
    }
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

async function loadArchiveSidecar(sidecarPath: string): Promise<ArchiveSidecarLoadResult> {
  try {
    const raw = await readFile(sidecarPath, 'utf8');
    const archive = parseArchiveMetadata(JSON.parse(raw) as unknown);
    return {
      path: sidecarPath,
      archive,
      diagnostics: []
    };
  } catch (error) {
    return {
      path: sidecarPath,
      error: formatSidecarLoadError(error),
      diagnostics: []
    };
  }
}

async function readRecentProjects(recentProjectsPath: string): Promise<string[]> {
  try {
    const raw = await readFile(recentProjectsPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? sanitizeRecentProjects(parsed.filter((item): item is string => typeof item === 'string')) : [];
  } catch {
    return [];
  }
}

async function writeRecentProjects(recentProjectsPath: string, recentProjects: string[]): Promise<void> {
  await mkdir(dirname(recentProjectsPath), { recursive: true });
  await writeFile(recentProjectsPath, JSON.stringify(sanitizeRecentProjects(recentProjects), null, 2), 'utf8');
}

function isVarRecentProject(projectFilePath: string): boolean {
  const normalized = projectFilePath.toLowerCase().replace(/\\/g, '/');
  return normalized.startsWith('/var/') || normalized.startsWith('/private/var/');
}

function sanitizeRecentProjects(recentProjects: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const recentProject of recentProjects) {
    if (isVarRecentProject(recentProject) || seen.has(recentProject)) {
      continue;
    }
    seen.add(recentProject);
    sanitized.push(recentProject);
  }
  return sanitized.slice(0, 12);
}

export function createProjectService({ dialog, shell, logger, recentProjectsPath, onRecentProjectsChanged }: ProjectServiceOptions) {
  let cachedSession: ProjectSessionSnapshot | undefined;
  let lastRecentProjectsSignature = '';

  async function rememberRecentProject(projectFilePath: string): Promise<string[]> {
    const recentProjects = await readRecentProjects(recentProjectsPath);
    const nextRecentProjects = sanitizeRecentProjects([projectFilePath, ...recentProjects.filter((item) => item !== projectFilePath)]);
    await writeRecentProjects(recentProjectsPath, nextRecentProjects);
    return nextRecentProjects;
  }

  async function updateRecentProjects(recentProjects: string[]): Promise<string[]> {
    const nextRecentProjects = sanitizeRecentProjects(recentProjects);
    lastRecentProjectsSignature = JSON.stringify(nextRecentProjects);
    await writeRecentProjects(recentProjectsPath, nextRecentProjects);
    if (cachedSession) {
      cachedSession = {
        ...cachedSession,
        recentProjects: nextRecentProjects
      };
    }
    onRecentProjectsChanged?.(nextRecentProjects);
    return nextRecentProjects;
  }

  watchFile(recentProjectsPath, { persistent: false, interval: 700 }, () => {
    void (async () => {
      const recentProjects = await readRecentProjects(recentProjectsPath);
      const nextSignature = JSON.stringify(recentProjects);
      if (nextSignature === lastRecentProjectsSignature) {
        return;
      }

      lastRecentProjectsSignature = nextSignature;
      if (cachedSession) {
        cachedSession = {
          ...cachedSession,
          recentProjects
        };
      }
      onRecentProjectsChanged?.(recentProjects);
    })();
  });

  function cacheSession(session: ProjectSessionSnapshot): ProjectSessionSnapshot {
    cachedSession = session;
    return session;
  }

  async function commitProjectMutation(project: ProjectSessionSnapshot['project'], projectFilePath?: string): Promise<ProjectMutationResult> {
    if (projectFilePath) {
      const session = await writeProjectFile(dirname(projectFilePath), project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return {
        session: cacheSession({
          ...session,
          recentProjects
        }),
        saved: true
      };
    }

    return {
      session: cacheSession({
        project,
        projectFilePath: cachedSession?.projectFilePath,
        projectRoot: cachedSession?.projectRoot,
        recentProjects: cachedSession?.recentProjects ?? []
      }),
      saved: false
    };
  }

  function applyProjectOperation(project: ProjectSessionSnapshot['project'], operation: ProjectOperation): ProjectSessionSnapshot['project'] {
    switch (operation.type) {
      case 'mergeImportedAssets':
        return domainOps.mergeImportedAssets(project, operation.assets);
      case 'relinkAsset':
        return domainOps.replaceAssetPath(project, operation.assetId, {
          absolutePath: operation.absolutePath,
          relativePath: operation.relativePath
        });
      case 'updateCutStatus':
        return domainOps.updateCutStatus(project, operation.cutId, operation.status);
      case 'toggleCutFavorite':
        return domainOps.toggleCutFavorite(project, operation.cutId);
      case 'trimCut':
        return domainOps.trimCut(project, operation.cutId, operation.startMs, operation.endMs);
      case 'addCutToBin':
        return domainOps.addCutToBin(project, operation.cutId, operation.binId);
      case 'addCutToSequence':
        return domainOps.addCutToSequence(project, operation.cutId, operation.options);
      case 'buildVariantFromReviewedCuts':
        return domainOps.buildVariantFromReviewedCuts(project, operation.variantId, operation.mode);
      case 'buildNewVariantFromReviewedCuts':
        return domainOps.buildNewVariantFromReviewedCuts(project, operation.variantId, operation.mode);
      case 'moveClip':
        return domainOps.moveClip(project, operation.variantId, operation.clipId, operation.direction);
      case 'removeClip':
        return domainOps.removeClip(project, operation.variantId, operation.clipId);
      case 'trimClip':
        return domainOps.trimClip(project, operation.variantId, operation.clipId, operation.deltaMs);
      case 'setClipOverlayAsset':
        return domainOps.setClipOverlayAsset(project, operation.variantId, operation.clipId, operation.assetId);
      case 'setClipOverlayCut':
        return domainOps.setClipOverlayCut(project, operation.variantId, operation.clipId, operation.cutId);
      case 'setClipTransition':
        return domainOps.setClipTransition(project, operation.variantId, operation.clipId, operation.transition);
      case 'setClipTransitionDuration':
        return domainOps.setClipTransitionDuration(project, operation.variantId, operation.clipId, operation.durationMs);
      case 'setClipTransitionAsset':
        return domainOps.setClipTransitionAsset(project, operation.variantId, operation.clipId, operation.assetId);
      case 'setClipTransitionCut':
        return domainOps.setClipTransitionCut(project, operation.variantId, operation.clipId, operation.cutId);
      case 'setClipTransitionOverlayAsset':
        return domainOps.setClipTransitionOverlayAsset(project, operation.variantId, operation.clipId, operation.assetId);
      case 'setClipTransitionOverlayCut':
        return domainOps.setClipTransitionOverlayCut(project, operation.variantId, operation.clipId, operation.cutId);
      case 'randomizeFoundryTransitions':
        return domainOps.randomizeFoundryTransitions(project, operation.variantId);
      case 'randomizeFoundryOverlays':
        return domainOps.randomizeFoundryOverlays(project, operation.variantId);
      case 'duplicateVariant':
        return domainOps.duplicateVariant(project, operation.variantId);
      case 'deleteVariant':
        return domainOps.deleteVariant(project, operation.variantId);
      case 'setActiveCompositionSequenceVariant':
        return domainOps.setActiveCompositionSequenceVariant(project, operation.sequenceId, operation.variantId);
      case 'updateCompositionScene':
        return domainOps.updateCompositionScene(project, operation.sceneId, {
          name: operation.name,
          climate: operation.climate
        });
      case 'updateCompositionLayer':
        return domainOps.updateCompositionLayer(project, operation.layerId, {
          name: operation.name,
          orderIndex: operation.orderIndex,
          mix: operation.mix,
          renderIntent: operation.renderIntent
        });
      case 'addMarker':
        return domainOps.addMarker(project, operation.variantId, {
          id: createProjectEntityId(project, 'marker'),
          label: operation.label,
          timeMs: operation.timeMs,
          kind: 'marker'
        });
      case 'addSection':
        return domainOps.addSection(project, operation.variantId, {
          id: createProjectEntityId(project, 'section'),
          label: operation.label,
          startMs: operation.startMs,
          endMs: operation.endMs
        });
      case 'addFilterToSequenceStack': {
        const stackId = operation.stackId ?? project.variants[0]?.stackId;
        if (!stackId || !getFilterDefinition(operation.filterType) || !getPrimaryAutomationProperty(operation.filterType)) {
          return project;
        }
        return domainOps.addFilterToStack(project, stackId, {
          id: createProjectEntityId(project, 'filter'),
          type: operation.filterType,
          enabled: true,
          parameters: getDefaultFilterParameters(operation.filterType),
          mix: 0.8
        });
      }
      case 'removeFilterFromSequenceStack':
        return domainOps.removeFilterFromStack(project, operation.stackId, operation.filterId);
      case 'moveFilterInSequenceStack':
        return domainOps.moveFilterInStack(project, operation.stackId, operation.filterId, operation.direction);
      case 'toggleFilterEnabled':
        return domainOps.toggleFilterEnabled(project, operation.stackId, operation.filterId);
      case 'updateFilterMix':
        return domainOps.updateFilterMix(project, operation.stackId, operation.filterId, operation.mix);
      case 'updateFilterParameter':
        return domainOps.updateFilterParameter(project, operation.stackId, operation.filterId, operation.key, operation.value);
      case 'applyPresetToSequenceStack': {
        const stackId = operation.stackId ?? project.variants[0]?.stackId;
        if (!stackId) {
          return project;
        }
        const libraryPreset = loadPresetLibrary().byId[operation.presetId];
        return libraryPreset
          ? domainOps.applyPresetDefinitionToStack(project, libraryPreset, stackId)
          : domainOps.applyPresetToStack(project, operation.presetId, stackId);
      }
      case 'safeRandomizeFilter':
        return domainOps.safeRandomizeFilter(project, operation.stackId, operation.filterId);
      case 'safeRandomizeStack':
        return domainOps.safeRandomizeStack(project, operation.stackId);
      case 'addAutomationLane':
        return domainOps.addAutomationLane(project, {
          id: createProjectEntityId(project, 'lane'),
          name: operation.name,
          target: {
            filterId: operation.filterId,
            property: operation.property
          },
          enabled: true,
          keyframes: [{
            id: createProjectEntityId(project, 'keyframe'),
            timeMs: 0,
            value: 0.5
          }]
        });
      case 'removeAutomationLane':
        return domainOps.removeAutomationLane(project, operation.laneId);
      case 'updateAutomationLaneTarget':
        return domainOps.updateAutomationLaneTarget(project, operation.laneId, {
          filterId: operation.filterId,
          property: operation.property
        });
      case 'setAutomationLaneEnabled':
        return domainOps.setAutomationLaneEnabled(project, operation.laneId, operation.enabled);
      case 'addLaneKeyframe':
        return domainOps.addLaneKeyframe(project, operation.laneId, {
          id: createProjectEntityId(project, 'keyframe'),
          timeMs: operation.timeMs,
          value: operation.value
        });
      case 'updateLaneKeyframe':
        return domainOps.updateLaneKeyframe(project, operation.laneId, operation.keyframeId, {
          timeMs: operation.timeMs,
          value: operation.value
        });
      case 'removeLaneKeyframe':
        return domainOps.removeLaneKeyframe(project, operation.laneId, operation.keyframeId);
      case 'resetLane':
        return domainOps.resetLane(project, operation.laneId);
      case 'toggleExportProfile':
        return domainOps.toggleExportProfile(project, operation.profileId);
      case 'setVariantMusicAsset':
        return domainOps.setVariantMusicAsset(project, operation.variantId, operation.assetId);
      case 'setProjectMusicAsset':
        return domainOps.setProjectMusicAsset(project, operation.assetId);
      case 'setVariantMusicSyncMode':
        return domainOps.setVariantMusicSyncMode(project, operation.variantId, operation.syncMode);
      case 'applySyncMarkers':
        return domainOps.applySyncMarkers(project, operation.variantId, operation.markers);
      case 'acceptArchiveCandidate':
        switch (operation.referenceKind) {
          case 'segment':
            return domainOps.acceptArchiveSegmentCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'motif':
            return domainOps.acceptArchiveMotifCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'atmosphere':
            return domainOps.acceptArchiveAtmosphereCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'material':
            return domainOps.acceptArchiveMaterialCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'motion':
            return domainOps.acceptArchiveMotionCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'behaviour-seed':
            return domainOps.acceptArchiveBehaviourSeedCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'recurrence':
            return domainOps.acceptArchiveRecurrenceCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'affinity':
            return domainOps.acceptArchiveAffinityCandidate(project, operation.archive, operation.candidateId, operation).project;
        }
        return project;
      case 'rejectArchiveCandidate':
        switch (operation.referenceKind) {
          case 'segment':
            return domainOps.rejectArchiveSegmentCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'motif':
            return domainOps.rejectArchiveMotifCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'atmosphere':
            return domainOps.rejectArchiveAtmosphereCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'material':
            return domainOps.rejectArchiveMaterialCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'motion':
            return domainOps.rejectArchiveMotionCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'behaviour-seed':
            return domainOps.rejectArchiveBehaviourSeedCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'recurrence':
            return domainOps.rejectArchiveRecurrenceCandidate(project, operation.archive, operation.candidateId, operation).project;
          case 'affinity':
            return domainOps.rejectArchiveAffinityCandidate(project, operation.archive, operation.candidateId, operation).project;
        }
        return project;
    }
  }

  async function readProjectSession(projectFilePath: string, recentProjects: string[]): Promise<ProjectSessionSnapshot> {
    const projectRoot = dirname(projectFilePath);
    const raw = await readFile(projectFilePath, 'utf8');
    const project = parseProject(JSON.parse(raw) as unknown);
    logger.setProjectRoot(projectRoot);

    return {
      project,
      projectFilePath,
      projectRoot,
      recentProjects
    };
  }

  async function writeProjectFile(projectRoot: string, project: SaveProjectRequest['project']) {
    await ensureProjectStructure(projectRoot);
    const projectFileName = project.metadata?.projectFileName ?? `${slugify(project.name) || 'afterimage-project'}.afterimage.json`;
    const projectFilePath = join(projectRoot, projectFileName);
    const nextProject = parseProject({
      ...project,
      metadata: {
        ...project.metadata,
        projectFileName,
        updatedAt: new Date().toISOString()
      }
    });

    await writeFile(projectFilePath, `${JSON.stringify(nextProject, null, 2)}\n`, 'utf8');
    logger.setProjectRoot(projectRoot);
    await logger.log('info', 'Saved project file.', projectFilePath);
    return {
      project: nextProject,
      projectFilePath,
      projectRoot
    };
  }

  async function probeImportedAsset(filePath: string): Promise<Pick<MediaAsset, 'durationMs' | 'hasAudio'>> {
    const tools = resolveFfmpegTools();
    const probeResult = await executeCommandSpec({
      label: `probe:import:${basename(filePath)}`,
      binary: tools.ffprobe.path,
      args: [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]
    });
    const probe = parseFfprobeOutput(probeResult.stdout);

    return {
      durationMs: probe.durationMs,
      hasAudio: probe.streams.some((stream) => stream.codecType === 'audio')
    };
  }

  async function mapImportedAsset(
    filePath: string,
    kind: 'media' | 'music' | 'transition-mask' | 'transition-overlay',
    projectRoot?: string
  ): Promise<MediaAsset> {
    const stem = basename(filePath, extname(filePath));
    const mediaType = kind === 'music' ? 'audio' : inferMediaType(filePath, kind);
    const assetRole: AssetRole = kind === 'music'
      ? 'music'
      : kind === 'transition-mask'
        ? 'transition-mask'
        : kind === 'transition-overlay'
          ? 'transition-overlay'
          : 'source';
    const fallbackHasAudio = kind === 'music' || mediaType === 'audio' || !/\.(png|jpg|jpeg|webp|gif)$/i.test(filePath);
    let probeMetadata: Pick<MediaAsset, 'durationMs' | 'hasAudio'> | undefined;

    if (mediaType !== 'image' && kind !== 'transition-mask' && kind !== 'transition-overlay') {
      try {
        probeMetadata = await probeImportedAsset(filePath);
      } catch (error) {
        await logger.log('warn', 'Failed to probe imported media.', `${filePath} :: ${getErrorMessage(error)}`);
      }
    }

    return {
      id: `asset-${slugify(stem)}-${slugify(assetRole)}-${stableHash(`${assetRole}:${filePath}`).slice(0, 6)}`,
      filename: basename(filePath),
      mediaType,
      assetRole,
      path: projectRoot ? buildPathRef(projectRoot, filePath) : { absolutePath: filePath },
      label: stem,
      durationMs: probeMetadata?.durationMs,
      hasAudio: kind === 'transition-mask' || kind === 'transition-overlay'
        ? false
        : (probeMetadata?.hasAudio ?? fallbackHasAudio),
      importStatus: 'ready',
      analysisStatus: mediaType === 'image' ? 'completed' : 'pending',
      tags: kind === 'music' ? ['music'] : []
    };
  }

  return {
    async getInitialState(): Promise<ProjectSessionSnapshot> {
      if (cachedSession) {
        return cachedSession;
      }

      const recentProjects = await readRecentProjects(recentProjectsPath);
      lastRecentProjectsSignature = JSON.stringify(recentProjects);
      const mostRecentProject = recentProjects[0];

      if (mostRecentProject) {
        try {
          return cacheSession(await readProjectSession(mostRecentProject, recentProjects));
        } catch (error) {
          await logger.log('warn', 'Failed to restore recent project file.', `${mostRecentProject} :: ${getErrorMessage(error)}`);
        }
      }

      return cacheSession({
        project: createEmptyProject({
          id: 'project-studio-desktop',
          name: 'Studio Desktop'
        }),
        recentProjects
      });
    },
    async createProject(options: { name?: string } = {}): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Choose Universe Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const projectRoot = result.filePaths[0];
      const projectName = options.name ?? basename(projectRoot);
      const project = createEmptyProject({
        id: slugify(projectName) || 'afterimage-project',
        name: projectName
      });
      const session = await writeProjectFile(projectRoot, project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);

      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async openProject(): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Open Afterimage Universe',
        properties: ['openFile'],
        filters: [{ name: 'Afterimage Universe', extensions: ['json'] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return this.openProjectAt(result.filePaths[0]);
    },
    async openProjectAt(projectFilePath: string): Promise<ProjectSessionSnapshot> {
      const recentProjects = await rememberRecentProject(projectFilePath);
      return cacheSession(await readProjectSession(projectFilePath, recentProjects));
    },
    async removeRecentProject(projectFilePath: string): Promise<string[]> {
      const recentProjects = await readRecentProjects(recentProjectsPath);
      const nextRecentProjects = recentProjects.filter((item) => item !== projectFilePath);
      return updateRecentProjects(nextRecentProjects);
    },
    async saveProject(input: SaveProjectRequest): Promise<ProjectSessionSnapshot> {
      const projectRoot = input.projectFilePath ? dirname(input.projectFilePath) : undefined;

      if (!projectRoot) {
        const session = await this.saveProjectAs(input);
        if (!session) {
          throw new Error('Save Universe As was cancelled.');
        }
        return session;
      }

      const session = await writeProjectFile(projectRoot, input.project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async saveProjectAs(input: SaveProjectRequest): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Choose Universe Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const session = await writeProjectFile(result.filePaths[0], input.project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async duplicateProject(input: SaveProjectRequest): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Choose Universe Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const duplicateProject = parseProject({
        ...input.project,
        id: `${input.project.id}-copy`,
        name: `${input.project.name} Copy`
      });
      const session = await writeProjectFile(result.filePaths[0], duplicateProject);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async revealProjectFolder(projectFilePath: string): Promise<void> {
      shell.showItemInFolder(projectFilePath);
    },
    async loadAnalysis(analysisPath: string) {
      try {
        const raw = await readFile(analysisPath, 'utf8');
        return parseAnalysis(JSON.parse(raw) as unknown);
      } catch (error) {
        await logger.log('warn', 'Failed to load analysis sidecar.', `${analysisPath} :: ${getErrorMessage(error)}`);
        return null;
      }
    },
    async listArchiveSidecars(input: ArchiveSidecarListRequest): Promise<ArchiveSidecarListResult> {
      if (!input.projectRoot) {
        const diagnostics = domainOps.collectArchiveDiagnostics({
          project: input.project,
          archives: [],
          publishable: true
        });
        return {
          sidecars: [],
          diagnostics
        };
      }

      const sidecarPaths = [...new Set((await Promise.all(
        archiveSidecarRoots.map((archiveRoot) => collectArchiveSidecarPaths(join(input.projectRoot as string, archiveRoot)))
      )).flat())].sort((left, right) => left.localeCompare(right));
      const sidecars = await Promise.all(sidecarPaths.map((sidecarPath) => loadArchiveSidecar(sidecarPath)));
      const archives = sidecars
        .map((sidecar) => sidecar.archive)
        .filter((archive): archive is NonNullable<ArchiveSidecarLoadResult['archive']> => Boolean(archive));
      const diagnostics = domainOps.collectArchiveDiagnostics({
        project: input.project,
        archives,
        publishable: true
      });
      const diagnosticsByArchive = new Map<string, typeof diagnostics>();

      for (const archive of archives) {
        diagnosticsByArchive.set(
          archive.id,
          diagnostics.filter((diagnostic) => diagnostic.path.startsWith(`archives.${archive.id}.`))
        );
      }

      return {
        sidecars: sidecars.map((sidecar) => sidecar.archive
          ? {
              ...sidecar,
              diagnostics: diagnosticsByArchive.get(sidecar.archive.id) ?? []
            }
          : sidecar),
        diagnostics
      };
    },
    async importMedia(projectRoot?: string): Promise<MediaAsset[]> {
      const result = await dialog.showOpenDialog({
        title: 'Import Media',
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled) {
        await logger.log('info', 'Media import cancelled.');
        return [];
      }

      const assets = await Promise.all(result.filePaths.map((filePath) => mapImportedAsset(filePath, 'media', projectRoot)));
      await logger.log('info', 'Imported media files.', `${assets.length} file(s)${projectRoot ? '' : ' into unsaved project state'}`);
      return assets;
    },
    async importMusic(projectRoot?: string): Promise<MediaAsset[]> {
      const result = await dialog.showOpenDialog({
        title: 'Import Music',
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled) {
        await logger.log('info', 'Music import cancelled.');
        return [];
      }

      const assets = await Promise.all(result.filePaths.map((filePath) => mapImportedAsset(filePath, 'music', projectRoot)));
      await logger.log('info', 'Imported music files.', `${assets.length} file(s)${projectRoot ? '' : ' into unsaved project state'}`);
      return assets;
    },
    async importTransitionMasks(projectRoot?: string): Promise<MediaAsset[]> {
      const result = await dialog.showOpenDialog({
        title: 'Import Transition Masks',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'] }]
      });

      if (result.canceled) {
        await logger.log('info', 'Transition mask import cancelled.');
        return [];
      }

      const assets = await Promise.all(result.filePaths.map((filePath) => mapImportedAsset(filePath, 'transition-mask', projectRoot)));
      await logger.log('info', 'Imported transition masks.', `${assets.length} file(s)${projectRoot ? '' : ' into unsaved project state'}`);
      return assets;
    },
    async importTransitionOverlays(projectRoot?: string): Promise<MediaAsset[]> {
      const result = await dialog.showOpenDialog({
        title: 'Import Transition Overlays',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'] }]
      });

      if (result.canceled) {
        await logger.log('info', 'Transition overlay import cancelled.');
        return [];
      }

      const assets = await Promise.all(result.filePaths.map((filePath) => mapImportedAsset(filePath, 'transition-overlay', projectRoot)));
      await logger.log('info', 'Imported transition overlays.', `${assets.length} file(s)${projectRoot ? '' : ' into unsaved project state'}`);
      return assets;
    },
    async relinkAsset(input: { projectRoot: string; assetId: string; currentPath?: string }): Promise<RelinkAssetResult | null> {
      const result = await dialog.showOpenDialog({
        title: 'Relink Missing Asset',
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        await logger.log('info', 'Relink cancelled.', input.assetId);
        return null;
      }

      const relinkedAsset = {
        assetId: input.assetId,
        path: buildPathRef(input.projectRoot, result.filePaths[0])
      };
      await logger.log('info', 'Relinked asset.', input.assetId);
      return relinkedAsset;
    },
    async importCueFile(): Promise<ImportCueFileResult | null> {
      const result = await dialog.showOpenDialog({
        title: 'Import Afterimage Cue File',
        properties: ['openFile'],
        filters: [
          { name: 'Afterimage Cue Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        await logger.log('info', 'Cue import cancelled.');
        return null;
      }

      const cuePath = result.filePaths[0];
      const raw = await readFile(cuePath, 'utf8');
      const markers = parseAfterimageCueFile(raw);
      await logger.log('info', 'Imported cue file.', `${cuePath} :: ${markers.length} cue(s)`);
      return {
        path: cuePath,
        markers
      };
    },
    async importArchiveSidecars(input: { projectRoot: string }): Promise<ArchiveSidecarImportResult> {
      const result = await dialog.showOpenDialog({
        title: 'Import Archive Sidecar',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Archive Sidecar JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        await logger.log('info', 'Archive sidecar import cancelled.');
        return {
          importedPaths: [],
          rejected: []
        };
      }

      const archiveRoot = join(input.projectRoot, '.afterimage', 'archive');
      await mkdir(archiveRoot, { recursive: true });
      const importedPaths: string[] = [];
      const rejected: ArchiveSidecarLoadResult[] = [];

      for (const sidecarPath of result.filePaths) {
        const loaded = await loadArchiveSidecar(sidecarPath);
        if (!loaded.archive) {
          rejected.push(loaded);
          continue;
        }

        const destinationPath = join(archiveRoot, `${loaded.archive.id}.archive.json`);
        if (resolve(sidecarPath) !== resolve(destinationPath)) {
          await copyFile(sidecarPath, destinationPath);
        }
        importedPaths.push(destinationPath);
      }

      await logger.log('info', 'Imported archive sidecars.', `${importedPaths.length} imported, ${rejected.length} rejected.`);
      return {
        importedPaths,
        rejected
      };
    },
    applyProjectOperation(input: { project: ProjectSessionSnapshot['project']; operation: ProjectOperation }): ProjectSessionSnapshot['project'] {
      return applyProjectOperation(input.project, input.operation);
    },
    async materializeAnalysisCuts(input: ProjectMaterializeAnalysisCutsRequest): Promise<ProjectMutationResult> {
      const analysis = await this.loadAnalysis(input.analysisPath);
      if (!analysis) {
        throw new Error('Analysis sidecar could not be loaded.');
      }

      const result = domainOps.materializeAnalysisCuts({
        project: input.project,
        analysis: {
          ...analysis,
          id: input.analysisRefId ?? analysis.id,
          assetId: input.assetId
        },
        analysisRefId: input.analysisRefId,
        status: 'new',
        tags: []
      });
      const mutation = await commitProjectMutation(result.project, input.projectFilePath);
      return {
        ...mutation,
        addedCutIds: result.addedCutIds
      };
    },
    commitProjectMutation
  };
}
