import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { exportProfiles, type ExportProfileId } from '@afterimage/export-profiles';
import { loadPresetLibrary } from '@afterimage/preset-library';
import type {
  AnalysisFile,
  AssetRole,
  AutomationTargetProperty,
  CutCandidate,
  FilterDefinition,
  FilterInstance,
  Marker,
  MediaAsset,
  NormalizedProjectFile,
  SequenceClip,
  SupportedFilterType,
  SyncMode,
  TransitionStyle
} from '@afterimage/project-model';
import { Panel } from '@afterimage/ui';
import { getStudioClient, type DesktopJob, type LibraryAsset, type LibraryRoot, type LibrarySearchRequest } from '../lib/studio-client';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import { useUiStore } from '../stores/ui-store';
import { accent, muted, pillStyle } from '../app/styles';
import { getEnabledExportProfileIds, resolveProjectFilePath, toMediaSrc } from '../app/utils';
import { JobRow } from '../app/components/JobRow';
import { StatCard } from '../app/components/StatCard';
import { StudioDataGrid, type StudioGridAction } from '../app/components/StudioDataGrid';
import { ToolbarButton } from '../app/components/ToolbarButton';

export const supportedFilterDefinitions = [
  {
    type: 'contrast',
    label: 'Contrast',
    ffmpegGroup: 'eq',
    parameters: [{ key: 'contrast', label: 'Contrast', min: 0, max: 1, defaultValue: 0.35, step: 0.01 }]
  },
  {
    type: 'brightness',
    label: 'Brightness',
    ffmpegGroup: 'eq',
    parameters: [{ key: 'brightness', label: 'Brightness', min: 0, max: 1, defaultValue: 0.5, step: 0.01 }]
  },
  {
    type: 'blur',
    label: 'Blur',
    ffmpegGroup: 'gblur',
    parameters: [{ key: 'radius', label: 'Radius', min: 0, max: 1, defaultValue: 0.24, step: 0.01 }]
  },
  {
    type: 'bloom-soft',
    label: 'Bloom Soft',
    ffmpegGroup: 'gblur',
    parameters: [{ key: 'strength', label: 'Strength', min: 0, max: 1, defaultValue: 0.28, step: 0.01 }]
  },
  {
    type: 'glitch-bands',
    label: 'Glitch Bands',
    ffmpegGroup: 'noise',
    parameters: [{ key: 'strength', label: 'Strength', min: 0, max: 1, defaultValue: 0.22, step: 0.01 }]
  },
  {
    type: 'chroma-bleed',
    label: 'Chroma Bleed',
    ffmpegGroup: 'eq',
    parameters: [{ key: 'strength', label: 'Strength', min: 0, max: 1, defaultValue: 0.25, step: 0.01 }]
  }
] as const satisfies readonly FilterDefinition[];

export function getAssetById(project: NormalizedProjectFile, assetId: string): MediaAsset | undefined {
  return project.assets.find((asset) => asset.id === assetId);
}

export function getDefaultVariant(project: NormalizedProjectFile, sequenceId?: string) {
  const sequence = sequenceId
    ? project.sequences.find((candidate) => candidate.id === sequenceId)
    : project.sequences.find((candidate) => candidate.id === project.defaultSequenceId) ?? project.sequences[0];
  const variantId = sequence?.defaultVariantId ?? sequence?.variantIds[0];
  return variantId ? project.variants.find((variant) => variant.id === variantId) : undefined;
}

export function getFilterDefinition(type: string): FilterDefinition | undefined {
  return supportedFilterDefinitions.find((definition) => definition.type === type);
}

export function formatFilterInstanceLabel(filter: FilterInstance | undefined, stackFilters: FilterInstance[]): string {
  if (!filter) {
    return 'Missing filter';
  }

  const baseLabel = getFilterDefinition(filter.type)?.label ?? formatParameterLabel(filter.type);
  const matchingFilters = stackFilters.filter((candidate) => candidate.type === filter.type);
  if (matchingFilters.length <= 1) {
    return baseLabel;
  }

  const ordinal = matchingFilters.findIndex((candidate) => candidate.id === filter.id) + 1;
  return `${baseLabel} ${Math.max(ordinal, 1)}`;
}

export function getSupportedAutomationProperties(type: string): AutomationTargetProperty[] {
  const definition = getFilterDefinition(type);
  return definition ? ['mix', ...definition.parameters.map((parameter) => parameter.key)] : [];
}

export function getCurrentVariant(project: NormalizedProjectFile, selectedVariantId?: string) {
  return project.variants.find((candidate) => candidate.id === (selectedVariantId ?? getDefaultVariant(project)?.id)) ?? project.variants[0];
}

export function getAnalysisSummaryByAsset(project: NormalizedProjectFile, assetId: string) {
  return project.analysisRefs.find((ref) => ref.assetId === assetId)?.summary;
}

export function formatSequenceName(name: string, index?: number): string {
  const normalized = name.replace(/\bAssembly\b/g, 'Sequence');
  if (/^Sequence\s+\d{3}$/i.test(normalized.trim())) {
    return normalized;
  }

  if (typeof index === 'number') {
    return `Sequence ${String(index + 1).padStart(3, '0')}`;
  }

  return normalized;
}

export function useAnalysisFile(analysisPath?: string): AnalysisFile | null {
  const api = getStudioClient();
  const [analysis, setAnalysis] = useState<AnalysisFile | null>(null);

  useEffect(() => {
    let active = true;

    if (!analysisPath) {
      setAnalysis(null);
      return () => {
        active = false;
      };
    }

    void api.project.loadAnalysis(analysisPath).then((result) => {
      if (active) {
        setAnalysis(result);
      }
    });

    return () => {
      active = false;
    };
  }, [analysisPath, api.project]);

  return analysis;
}

export const catalogRoles: Array<{ value: AssetRole; label: string }> = [
  { value: 'source', label: 'Footage' },
  { value: 'transition-mask', label: 'Transitions' },
  { value: 'transition-overlay', label: 'Overlays' }
];

export function formatCatalogRole(role: AssetRole): string {
  return catalogRoles.find((candidate) => candidate.value === role)?.label ?? formatParameterLabel(role);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getSceneSegments(analysis: AnalysisFile | null | undefined) {
  if (!analysis) {
    return [];
  }

  const durationMs = Math.max(analysis.summary?.durationMs ?? analysis.probe.durationMs ?? 0, 0);
  const cutPoints = analysis.sceneCuts
    .map((scene) => Math.max(0, Math.min(durationMs, Math.round(scene.timeMs))))
    .filter((timeMs) => timeMs > 0 && timeMs < durationMs)
    .sort((left, right) => left - right);
  const boundaries = [0, ...cutPoints, durationMs].filter((timeMs, index, values) => index === 0 || timeMs > values[index - 1]);

  return boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    return {
      id: `scene-${index + 1}-${startMs}`,
      index,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      score: analysis.sceneCuts.find((scene) => Math.round(scene.timeMs) === startMs)?.score
    };
  }).filter((scene) => scene.durationMs > 0);
}

export function buildSyncMarkers(syncEvents: Array<{ id: string; timeMs: number; kind: string; label?: string }>): Marker[] {
  return syncEvents.map((event, index) => ({
    id: `sync-marker-${event.id}`,
    timeMs: event.timeMs,
    label: event.label ?? `${event.kind} ${index + 1}`,
    kind: event.kind === 'beat' || event.kind === 'downbeat' ? 'beat' : 'marker'
  }));
}

export function renderTimeline(durationMs: number, events: Array<{ id: string; timeMs: number; kind: string; strength?: number }>) {
  const safeDuration = Math.max(durationMs, 1);

  return (
    <div style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', padding: 16, background: 'rgba(11, 14, 19, 0.92)' }}>
      <div style={{ position: 'relative', height: 42, borderRadius: 999, background: 'linear-gradient(90deg, rgba(109, 132, 166, 0.22), rgba(120, 178, 154, 0.18), rgba(156, 138, 201, 0.2))' }}>
        {events.map((event) => {
          const left = `${Math.min(100, (event.timeMs / safeDuration) * 100)}%`;
          const size = 10 + Math.round((event.strength ?? 0.4) * 8);
          return (
            <div
              key={event.id}
              title={`${event.kind} @ ${event.timeMs}ms`}
              style={{
                position: 'absolute',
                left,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: size,
                height: size,
                borderRadius: 999,
                background: event.kind === 'accent' ? '#b7a1dc' : event.kind === 'silence-boundary' ? '#8ea4c4' : accent,
                boxShadow: '0 0 0 2px rgba(10, 13, 18, 0.95)'
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12, marginTop: 10 }}>
        <span>0ms</span>
        <span>{safeDuration}ms</span>
      </div>
    </div>
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function AutomationLaneTimeline({
  durationMs,
  keyframes,
  propertyLabel,
  onUpdate
}: {
  durationMs: number;
  keyframes: Array<{ id: string; timeMs: number; value: number }>;
  propertyLabel: string;
  onUpdate: (keyframeId: string, timeMs: number, value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<string>();

  useEffect(() => {
    if (!draggingKeyframeId) {
      return undefined;
    }

    const updateFromPointer = (clientX: number, clientY: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }

      const bounds = track.getBoundingClientRect();
      const nextTimeMs = Math.round((clamp((clientX - bounds.left) / bounds.width, 0, 1) * durationMs) / 10) * 10;
      const nextValue = Number((1 - clamp((clientY - bounds.top) / bounds.height, 0, 1)).toFixed(2));
      onUpdate(draggingKeyframeId, nextTimeMs, nextValue);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateFromPointer(event.clientX, event.clientY);
    };

    const handlePointerUp = () => {
      setDraggingKeyframeId(undefined);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingKeyframeId, durationMs, onUpdate]);

  const sortedKeyframes = [...keyframes].sort((left, right) => left.timeMs - right.timeMs);
  const polylinePoints = sortedKeyframes
    .map((keyframe) => `${(keyframe.timeMs / Math.max(durationMs, 1)) * 100},${(1 - keyframe.value) * 100}`)
    .join(' ');

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12 }}>
        <span>{propertyLabel}</span>
        <span>Drag keyframes directly</span>
      </div>
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 170,
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '100% 25%, 12.5% 100%' }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#88a0bf"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        {sortedKeyframes.map((keyframe) => (
          <button
            key={keyframe.id}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              setDraggingKeyframeId(keyframe.id);
            }}
            title={`${Math.round(keyframe.timeMs)}ms • ${keyframe.value.toFixed(2)}`}
            style={{
              position: 'absolute',
              left: `${(keyframe.timeMs / Math.max(durationMs, 1)) * 100}%`,
              top: `${(1 - keyframe.value) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: 999,
              border: '2px solid rgba(9, 11, 15, 0.96)',
              background: draggingKeyframeId === keyframe.id ? '#b7a1dc' : '#88a0bf',
              boxShadow: '0 0 0 4px rgba(136,160,191,0.16)',
              cursor: 'grab',
              padding: 0
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12 }}>
        <span>0ms</span>
        <span>{durationMs}ms</span>
      </div>
    </div>
  );
}

export function formatParameterLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/-/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function getStackForCurrentVariant(project: NormalizedProjectFile, variantId?: string) {
  const variant = getCurrentVariant(project, variantId);
  return variant?.stackId ? project.filterStacks.find((stack) => stack.id === variant.stackId) : undefined;
}

export function filterTransitionAssets(assets: MediaAsset[], kind: 'mask' | 'overlay') {
  const role = kind === 'mask' ? 'transition-mask' : 'transition-overlay';
  return assets.filter((asset) => asset.mediaType === 'video' && asset.assetRole === role);
}

export function formatSequenceAssetLabel(asset: MediaAsset): string {
  const raw = asset.label ?? asset.filename;
  const foundryMatch = raw.match(/__(.+?)__seed-(\d+)/);
  if (!foundryMatch) {
    return raw;
  }

  const descriptor = foundryMatch[1] ?? raw;
  const seed = foundryMatch[2];
  return `${descriptor} • ${seed}`;
}

export function formatMillisecondsClock(value?: number): string {
  const safeValue = Math.max(0, Math.round(value ?? 0));
  const minutes = Math.floor(safeValue / 60000);
  const seconds = Math.floor((safeValue % 60000) / 1000);
  const tenths = Math.floor((safeValue % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export function formatSequenceCutLabel(project: NormalizedProjectFile, cut: CutCandidate): string {
  const asset = getAssetById(project, cut.assetId);
  const assetLabel = asset ? formatSequenceAssetLabel(asset) : cut.assetId;
  return `${assetLabel} @ ${formatMillisecondsClock(cut.startMs)} (${formatMillisecondsClock(cut.durationMs)})`;
}

export function formatMillisecondsDetail(value?: number): string {
  const safeValue = Math.max(0, Math.round(value ?? 0));
  return `${formatMillisecondsClock(safeValue)} • ${safeValue}ms`;
}

export function formatAssetListSubline(asset: MediaAsset): string {
  if (asset.label && asset.label !== asset.filename) {
    return asset.filename;
  }

  const pathSegments = asset.path.absolutePath.split(/[\\/]/).filter(Boolean);
  return pathSegments.slice(-2).join('/');
}

export function formatPathTail(value: string): string {
  const pathSegments = value.split(/[\\/]/).filter(Boolean);
  return pathSegments.slice(-2).join('/');
}

export function getPathBasename(value: string): string {
  const pathSegments = value.split(/[\\/]/).filter(Boolean);
  return pathSegments[pathSegments.length - 1] ?? value;
}

export function isDisposableRecentProjectPath(projectFilePath: string): boolean {
  const normalized = projectFilePath.toLowerCase().replace(/\\/g, '/');
  return normalized.includes('afterimagetest')
    || /(^|[\/._\-\s])(test|tests|mock|mocks|fixture|fixtures)([\/._\-\s]|$)/i.test(normalized);
}

export function isVarRecentProjectPath(projectFilePath: string): boolean {
  const normalized = projectFilePath.replace(/\\/g, '/');
  return normalized.startsWith('/var/') || normalized.startsWith('/private/var/');
}

export function formatCutDisplayId(cutId: string): string {
  const matchedSuffix = cutId.match(/(cut-\d+)$/i);
  return matchedSuffix?.[1] ?? cutId;
}
