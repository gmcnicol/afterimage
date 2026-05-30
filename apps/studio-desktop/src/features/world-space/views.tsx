import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  MediaAsset,
  NormalizedProjectFile,
  NormalizedSceneDefinition,
  NormalizedSceneLayerDefinition,
  SceneClimate,
  SceneLayerRenderPassKind,
  Sequence
} from '@afterimage/project-model';
import { CapabilityBadge, CaptureTrustChip, PrimitiveScalarControl, WarningChip } from '@afterimage/ui';
import { ToolbarButton } from '../../app/components/ToolbarButton';
import { muted } from '../../app/styles';
import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import { deriveWorldSnapshot } from './helpers';

type CutCandidate = NormalizedProjectFile['cutCandidates'][number];

const passKinds: SceneLayerRenderPassKind[] = ['source', 'mask', 'overlay', 'behaviour', 'diagnostic'];

const line = 'rgba(255,255,255,0.1)';
const faintLine = 'rgba(255,255,255,0.06)';
const ink = '#f6f7f9';
const panel = 'rgba(8,10,14,0.78)';
const selectedPanel = 'rgba(255,255,255,0.07)';
const warm = '#e6c27a';
const bloom = '#c6b5ff';
const mint = '#9ed9c2';
const blue = '#9bb6df';
const rose = '#e7a6b0';

const passTone: Record<SceneLayerRenderPassKind, string> = {
  source: warm,
  mask: blue,
  overlay: rose,
  behaviour: mint,
  diagnostic: '#9aa0aa'
};

function formatPercent(value: number | undefined): string {
  return value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) {
    return '-';
  }

  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return minutes > 0 ? `${minutes}:${String(remaining).padStart(2, '0')}` : `${seconds}s`;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getVariantsForSequence(projectSequences: Sequence[], sequenceId?: string): string[] {
  return projectSequences.find((sequence) => sequence.id === sequenceId)?.variantIds ?? [];
}

function createNextRegionDraft(scenes: NormalizedSceneDefinition[]): { sceneId: string; name: string } {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const nextOrdinal = scenes.length + 1;
  const baseId = `scene-region-${nextOrdinal}`;
  let sceneId = baseId;
  let suffix = 2;

  while (sceneIds.has(sceneId)) {
    sceneId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {
    sceneId,
    name: `Region ${nextOrdinal}`
  };
}

function orbitPoint(index: number, total: number, radius: number): { left: string; top: string } {
  const angle = total <= 1 ? -Math.PI / 2 : ((Math.PI * 2 * index) / total) - Math.PI / 2;

  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius}%`
  };
}

function fieldInputStyle(): CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    height: 29,
    border: `1px solid ${line}`,
    background: 'rgba(0,0,0,0.24)',
    color: ink,
    padding: '0 9px',
    font: 'inherit',
    fontSize: 12
  };
}

function getArchiveAffinity(scene: NormalizedSceneDefinition | undefined): number {
  if (!scene) {
    return 0;
  }

  return clampUnit(scene.archiveReferenceIds.length / 4);
}

function getCaptureTrustState(previewReady: boolean, exportReady: boolean): 'trusted' | 'watch' | 'blocked' {
  if (!previewReady && !exportReady) {
    return 'blocked';
  }

  return exportReady ? 'trusted' : 'watch';
}

function getAssetName(asset?: MediaAsset): string {
  if (!asset) {
    return 'Unlinked source';
  }

  return asset.filename ?? asset.id;
}

function getCutStatusLabel(cut?: CutCandidate): string {
  if (!cut) {
    return 'sequence only';
  }

  if (cut.favorite || cut.status === 'favorite') {
    return 'favorite';
  }

  if (cut.status === 'kept') {
    return 'approved';
  }

  return cut.status ?? 'new';
}

function getLayerName(force: NormalizedSceneLayerDefinition, asset?: MediaAsset): string {
  const sourceName = getAssetName(asset);
  return sourceName === 'Unlinked source' ? force.name : sourceName.replace(/\.[a-z0-9]+$/i, '');
}

function Label(props: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>{props.label}</span>
      {props.children}
    </label>
  );
}

function Metric(props: { label: string; value: ReactNode; tone?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ color: muted }}>{props.label}</span>
      <span style={{ color: props.tone ?? ink }}>{props.value}</span>
    </span>
  );
}

function Section(props: { title: string; kicker?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{
      minWidth: 0,
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: '38px minmax(0, 1fr)',
      border: `1px solid ${line}`,
      background: panel,
      overflow: 'hidden',
      ...props.style
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minWidth: 0,
        gap: 10,
        padding: '0 10px',
        borderBottom: `1px solid ${faintLine}`
      }}>
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.title}</h2>
        {props.kicker ? <div style={{ color: muted, fontSize: 11, minWidth: 0 }}>{props.kicker}</div> : null}
      </header>
      {props.children}
    </section>
  );
}

function ValueList(props: { items: Array<[string, ReactNode]> }) {
  return (
    <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
      {props.items.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
          <span style={{ color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function RegionAtlasItem(props: {
  region: NormalizedSceneDefinition;
  forceCount: number;
  faults: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        display: 'grid',
        gap: 8,
        width: '100%',
        minWidth: 0,
        padding: 10,
        border: `1px solid ${props.selected ? 'rgba(198,181,255,0.48)' : faintLine}`,
        background: props.selected ? 'rgba(198,181,255,0.08)' : 'rgba(255,255,255,0.025)',
        color: ink,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit'
      }}
    >
      <span style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 8,
        minWidth: 0,
        alignItems: 'baseline'
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 500 }}>{props.region.name}</span>
        <span style={{ color: props.selected ? bloom : muted, fontSize: 11 }}>{props.selected ? 'active' : 'open'}</span>
      </span>
      <span style={{ color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {props.region.climate.atmosphere ?? 'neutral'} climate
      </span>
      <span style={{ display: 'flex', gap: 12, color: muted, flexWrap: 'wrap' }}>
        <Metric label="pressure" value={formatPercent(props.region.climate.pressure)} tone={bloom} />
        <Metric label="cohesion" value={formatPercent(props.region.climate.cohesion)} tone={mint} />
        <Metric label="forces" value={props.forceCount} />
        <Metric label="faults" value={props.faults} tone={props.faults > 0 ? rose : undefined} />
      </span>
    </button>
  );
}

function ForcePlate(props: {
  force: NormalizedSceneLayerDefinition;
  asset?: MediaAsset;
  cut?: CutCandidate;
  selected: boolean;
  index: number;
  total: number;
  onSelect: () => void;
}) {
  const point = orbitPoint(props.index, Math.max(props.total, 1), props.total <= 2 ? 28 : 35);
  const tone = passTone[props.force.renderIntent.passKind];
  const status = getCutStatusLabel(props.cut);

  return (
    <button
      type="button"
      onClick={props.onSelect}
      style={{
        position: 'absolute',
        left: point.left,
        top: point.top,
        transform: 'translate(-50%, -50%)',
        width: 172,
        minHeight: 54,
        border: `1px solid ${props.selected ? tone : line}`,
        borderLeft: `3px solid ${tone}`,
        background: props.selected ? selectedPanel : 'rgba(0,0,0,0.32)',
        boxShadow: props.selected ? `0 0 0 1px rgba(255,255,255,0.08), 0 14px 34px rgba(0,0,0,0.28)` : 'none',
        color: ink,
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'left',
        padding: '8px 9px'
      }}
    >
      <span style={{ display: 'grid', gap: 5, minWidth: 0 }}>
        <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{props.force.name}</span>
          <span style={{ color: tone, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>{props.force.renderIntent.passKind}</span>
        </span>
        <span style={{ color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getLayerName(props.force, props.asset)}
        </span>
        <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 7, alignItems: 'baseline' }}>
          <span style={{ color: muted, fontSize: 11 }}>presence {formatPercent(props.force.mix)}</span>
          <span style={{ color: status === 'rejected' ? rose : muted, fontSize: 11 }}>{status}</span>
        </span>
      </span>
    </button>
  );
}

function WorldCanvas(props: {
  region?: NormalizedSceneDefinition;
  forces: NormalizedSceneLayerDefinition[];
  selectedForceId?: string;
  assetsById: Map<string, MediaAsset>;
  cutsById: Map<string, CutCandidate>;
  onSelectForce: (forceId: string) => void;
}) {
  const selectedForce = props.forces.find((force) => force.id === props.selectedForceId);
  const selectedAsset = selectedForce?.assetId ? props.assetsById.get(selectedForce.assetId) : undefined;

  return (
    <div style={{
      position: 'relative',
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
      background:
        'radial-gradient(circle at 50% 50%, rgba(198,181,255,0.17), rgba(198,181,255,0.02) 34%, transparent 58%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      backgroundSize: '100% 100%, 44px 44px, 44px 44px'
    }}>
      <div style={{ position: 'absolute', inset: '8% 11%', border: `1px solid ${faintLine}` }} />
      <div style={{ position: 'absolute', inset: '18% 21%', border: `1px solid ${faintLine}` }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '35%',
        maxWidth: 360,
        minWidth: 230,
        transform: 'translate(-50%, -50%)',
        display: 'grid',
        gap: 9,
        textAlign: 'center'
      }}>
        <span style={{ color: bloom, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>active region</span>
        <strong style={{ fontSize: 34, lineHeight: 1, fontWeight: 500 }}>{props.region?.name ?? 'Uncharted'}</strong>
        <span style={{ color: muted }}>
          {props.region?.climate.atmosphere ?? 'neutral'} climate / {props.forces.length} forces / pressure {formatPercent(props.region?.climate.pressure)}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, paddingTop: 4 }}>
          <MiniGauge label="cohesion" value={props.region?.climate.cohesion} tone={mint} />
          <MiniGauge label="memory" value={props.region?.climate.memory} tone={blue} />
          <MiniGauge label="volatility" value={props.region?.climate.volatility} tone={rose} />
        </div>
      </div>
      {props.forces.map((force, index) => (
        <ForcePlate
          key={force.id}
          force={force}
          asset={force.assetId ? props.assetsById.get(force.assetId) : undefined}
          cut={force.cutId ? props.cutsById.get(force.cutId) : undefined}
          index={index}
          total={props.forces.length}
          selected={force.id === props.selectedForceId}
          onSelect={() => props.onSelectForce(force.id)}
        />
      ))}
      <div style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 12,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'end'
      }}>
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <span style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>field notes</span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Metric label="motifs" value={props.region?.climate.motifIds?.join(', ') || '-'} />
            <Metric label="materials" value={props.region?.climate.materialTags?.join(', ') || '-'} />
            <Metric label="activation" value={props.region?.activation.map((activation) => activation.kind).join(', ') || '-'} />
          </div>
        </div>
        <div style={{
          display: 'grid',
          gap: 3,
          maxWidth: 360,
          minWidth: 220,
          padding: '8px 10px',
          border: `1px solid ${faintLine}`,
          background: 'rgba(0,0,0,0.34)'
        }}>
          <span style={{ color: muted, fontSize: 11 }}>selected force</span>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {selectedForce ? getLayerName(selectedForce, selectedAsset) : 'No force selected'}
          </strong>
        </div>
      </div>
    </div>
  );
}

function MiniGauge(props: { label: string; value: number | undefined; tone: string }) {
  return (
    <span style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.label}</span>
      <span style={{ color: props.tone, fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{formatPercent(props.value)}</span>
    </span>
  );
}

function SceneShapePanel(props: {
  region: NormalizedSceneDefinition;
  regionNameDraft: string;
  onRegionNameDraft: (value: string) => void;
  onCommitRegionName: () => void;
  onUpdateRegion: (climate: Partial<SceneClimate>) => void;
  onUpdateRegionAtmosphere: (value: string) => void;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
          <span style={{ color: bloom, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>region mood</span>
          <ToolbarButton compact disabled={!props.canRemove} onClick={props.onRemove}>Remove</ToolbarButton>
        </span>
        <Label label="Name">
          <input
            value={props.regionNameDraft}
            onChange={(event) => props.onRegionNameDraft(event.target.value)}
            onBlur={props.onCommitRegionName}
            style={{ ...fieldInputStyle(), height: 34, fontSize: 14, fontWeight: 500 }}
          />
        </Label>
        <Label label="Atmosphere">
          <input
            value={props.region.climate.atmosphere ?? ''}
            onChange={(event) => props.onUpdateRegionAtmosphere(event.target.value)}
            style={fieldInputStyle()}
          />
        </Label>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <PrimitiveScalarControl
          valueKind="pressure"
          value={props.region.climate.pressure ?? 0}
          onChange={(value) => props.onUpdateRegion({ pressure: value })}
          inputProps={{ className: 'studio-fader' }}
        />
        <PrimitiveScalarControl
          valueKind="cohesion"
          value={props.region.climate.cohesion ?? 1}
          onChange={(value) => props.onUpdateRegion({ cohesion: value })}
          inputProps={{ className: 'studio-fader' }}
        />
        <PrimitiveScalarControl
          valueKind="memory"
          value={props.region.climate.memory ?? 0}
          onChange={(value) => props.onUpdateRegion({ memory: value })}
          inputProps={{ className: 'studio-fader' }}
        />
        <PrimitiveScalarControl
          valueKind="entropy"
          value={props.region.climate.entropyBias ?? 0}
          onChange={(value) => props.onUpdateRegion({ entropyBias: value })}
          inputProps={{ className: 'studio-fader' }}
        />
        <PrimitiveScalarControl
          valueKind="emergence"
          value={props.region.climate.transitionTendency ?? 0}
          onChange={(value) => props.onUpdateRegion({ transitionTendency: value })}
          inputProps={{ className: 'studio-fader' }}
        />
        <PrimitiveScalarControl
          valueKind="archive-affinity"
          value={getArchiveAffinity(props.region)}
          disabled
          inputProps={{ className: 'studio-fader' }}
        />
      </div>
    </div>
  );
}

function ForceShapePanel(props: {
  force: NormalizedSceneLayerDefinition;
  asset?: MediaAsset;
  cut?: CutCandidate;
  forceNameDraft: string;
  onForceNameDraft: (value: string) => void;
  onCommitForceName: () => void;
  onUpdateForce: (forceId: string, patch: Partial<NormalizedSceneLayerDefinition>) => void;
  onMoveForceToRegion: (force: NormalizedSceneLayerDefinition, sceneId: string) => void;
  onMoveForce: (force: NormalizedSceneLayerDefinition, direction: -1 | 1) => void;
  maxStack: number;
  regions: NormalizedSceneDefinition[];
}) {
  const tone = passTone[props.force.renderIntent.passKind];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ color: tone, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>selected force</span>
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 18, lineHeight: 1.15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getLayerName(props.force, props.asset)}
          </strong>
          <span style={{ color: getCutStatusLabel(props.cut) === 'rejected' ? rose : muted }}>
            {getCutStatusLabel(props.cut)} / {formatDuration(props.cut?.durationMs)}
          </span>
        </div>
        <Label label="Label">
          <input
            value={props.forceNameDraft}
            onChange={(event) => props.onForceNameDraft(event.target.value)}
            onBlur={props.onCommitForceName}
            style={fieldInputStyle()}
          />
        </Label>
        <Label label="Region">
          <select
            value={props.force.sceneId}
            onChange={(event) => props.onMoveForceToRegion(props.force, event.target.value)}
            style={fieldInputStyle()}
          >
            {props.regions.map((region) => (
              <option key={region.id} value={region.id}>{region.name}</option>
            ))}
          </select>
        </Label>
        <div style={{ display: 'grid', gap: 10 }}>
          <Label label="Presence">
            <input
              className="studio-fader"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.force.mix}
              onChange={(event) => props.onUpdateForce(props.force.id, { mix: Number(event.target.value) })}
            />
          </Label>
          <Label label="Stack">
            <input
              className="studio-fader"
              type="range"
              min={0}
              max={Math.max(0, props.maxStack - 1)}
              step={1}
              value={props.force.orderIndex}
              onChange={(event) => props.onUpdateForce(props.force.id, { orderIndex: Number(event.target.value) })}
            />
          </Label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 4, alignItems: 'center' }}>
          <span style={{ color: muted }}>position {props.force.orderIndex + 1}</span>
          <ToolbarButton compact onClick={() => props.onMoveForce(props.force, -1)}>Lift</ToolbarButton>
          <ToolbarButton compact onClick={() => props.onMoveForce(props.force, 1)}>Sink</ToolbarButton>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>Output</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4 }}>
          {passKinds.map((kind) => (
            <ToolbarButton
              key={kind}
              compact
              primary={props.force.renderIntent.passKind === kind}
              onClick={() => props.onUpdateForce(props.force.id, {
                renderIntent: { passKind: kind }
              })}
              style={{ color: props.force.renderIntent.passKind === kind ? ink : muted, borderColor: props.force.renderIntent.passKind === kind ? passTone[kind] : undefined }}
            >
              {kind}
            </ToolbarButton>
          ))}
        </div>
      </div>
      <details style={{ borderTop: `1px solid ${faintLine}`, paddingTop: 10 }}>
        <summary style={{ cursor: 'pointer', color: muted }}>Source details</summary>
        <div style={{ paddingTop: 8 }}>
          <ValueList items={[
            ['role', props.force.contribution],
            ['scope', props.force.scope],
            ['blend', props.force.blendIntent],
            ['asset', props.force.assetId ?? '-'],
            ['clip', props.force.clipId ?? '-'],
            ['stack', props.force.stackId ?? '-'],
            ['memory', props.force.archiveReferenceIds.join(', ') || '-']
          ]} />
        </div>
      </details>
    </div>
  );
}

export function WorldSpaceView() {
  const project = useProjectSessionStore((state) => state.project);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setActiveCompositionSequenceVariant = useProjectSessionStore((state) => state.setActiveCompositionSequenceVariant);
  const addCompositionScene = useProjectSessionStore((state) => state.addCompositionScene);
  const removeCompositionScene = useProjectSessionStore((state) => state.removeCompositionScene);
  const updateCompositionScene = useProjectSessionStore((state) => state.updateCompositionScene);
  const updateCompositionLayer = useProjectSessionStore((state) => state.updateCompositionLayer);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const jobs = useJobsStore((state) => state.jobs);
  const diagnostics = useDiagnosticsStore((state) => state.report);
  const [selectedRegionId, setSelectedRegionId] = useState<string>();
  const [selectedForceId, setSelectedForceId] = useState<string>();
  const snapshot = useMemo(
    () => deriveWorldSnapshot({
      project,
      dirty,
      jobs,
      diagnostics,
      selectedSceneId: selectedRegionId,
      selectedLayerId: selectedForceId
    }),
    [project, dirty, jobs, diagnostics, selectedRegionId, selectedForceId]
  );
  const selectedRegionSnapshot = snapshot.selectedScene;
  const selectedRegion = selectedRegionSnapshot?.scene;
  const selectedForce = snapshot.selectedLayer;
  const selectedForces = selectedRegionSnapshot?.layers ?? [];
  const [regionNameDraft, setRegionNameDraft] = useState(selectedRegion?.name ?? '');
  const [forceNameDraft, setForceNameDraft] = useState(selectedForce?.name ?? '');
  const variantIds = useMemo(() => getVariantsForSequence(project.sequences, snapshot.sequence?.id), [project.sequences, snapshot.sequence?.id]);
  const assetsById = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const cutsById = useMemo(() => new Map(project.cutCandidates.map((cut) => [cut.id, cut])), [project.cutCandidates]);
  const selectedForceAsset = selectedForce?.assetId ? assetsById.get(selectedForce.assetId) : undefined;
  const selectedForceCut = selectedForce?.cutId ? cutsById.get(selectedForce.cutId) : undefined;

  useEffect(() => {
    setSelectedRegionId((current) => current && snapshot.scenes.some((scene) => scene.scene.id === current)
      ? current
      : snapshot.selectedScene?.scene.id);
  }, [snapshot.scenes, snapshot.selectedScene?.scene.id]);

  useEffect(() => {
    setSelectedForceId((current) => current && snapshot.selectedScene?.layers.some((force) => force.id === current)
      ? current
      : snapshot.selectedLayer?.id);
  }, [snapshot.selectedLayer?.id, snapshot.selectedScene?.layers]);

  useEffect(() => {
    setRegionNameDraft(selectedRegion?.name ?? '');
  }, [selectedRegion?.id, selectedRegion?.name]);

  useEffect(() => {
    setForceNameDraft(selectedForce?.name ?? '');
  }, [selectedForce?.id, selectedForce?.name]);

  const commitRegionName = () => {
    if (selectedRegion && regionNameDraft.trim() && regionNameDraft !== selectedRegion.name) {
      updateCompositionScene(selectedRegion.id, { name: regionNameDraft.trim() });
    }
  };

  const commitForceName = () => {
    if (selectedForce && forceNameDraft.trim() && forceNameDraft !== selectedForce.name) {
      updateCompositionLayer(selectedForce.id, { name: forceNameDraft.trim() });
    }
  };

  const moveForce = (force: NormalizedSceneLayerDefinition, direction: -1 | 1) => {
    updateCompositionLayer(force.id, { orderIndex: Math.max(0, force.orderIndex + direction) });
  };
  const moveForceToRegion = (force: NormalizedSceneLayerDefinition, sceneId: string) => {
    updateCompositionLayer(force.id, { sceneId });
    setSelectedRegionId(sceneId);
    setSelectedForceId(force.id);
  };
  const addRegion = () => {
    const nextRegion = createNextRegionDraft(project.composition.scenes);
    addCompositionScene(nextRegion);
    setSelectedRegionId(nextRegion.sceneId);
    setSelectedForceId(undefined);
  };
  const removeSelectedRegion = () => {
    if (selectedRegion && project.composition.scenes.length > 1) {
      removeCompositionScene(selectedRegion.id);
      setSelectedRegionId(undefined);
      setSelectedForceId(undefined);
    }
  };
  const updateRegionClimate = (climate: Partial<SceneClimate>) => {
    if (selectedRegion) {
      updateCompositionScene(selectedRegion.id, { climate });
    }
  };

  const totalForces = snapshot.scenes.reduce((count, scene) => count + scene.layers.length, 0);

  return (
    <div
      aria-label="World creation surface"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 8,
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        padding: 10,
        overflow: 'hidden'
      }}
    >
      <header style={{
        minWidth: 0,
        minHeight: 86,
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1fr) auto',
        border: `1px solid ${line}`,
        background: 'linear-gradient(90deg, rgba(198,181,255,0.12), rgba(8,10,14,0.88) 36%, rgba(8,10,14,0.78))'
      }}>
        <div style={{ display: 'grid', alignContent: 'center', gap: 8, minWidth: 0, padding: '12px 14px', borderRight: `1px solid ${faintLine}` }}>
          <span style={{ color: bloom, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>world board</span>
          <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snapshot.compositionName}</h1>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: muted }}>
            <Metric label="regions" value={snapshot.scenes.length} />
            <Metric label="forces" value={totalForces} />
            <Metric label="memory" value={project.composition.acceptedArchiveReferences.length} />
            <Metric label="capture" value={<CaptureTrustChip state={getCaptureTrustState(snapshot.readiness.previewReady, snapshot.readiness.exportReady)} label={snapshot.readiness.exportReady ? 'ready' : 'blocked'} />} />
            <Metric label="state" value={dirty ? 'unsaved' : 'saved'} tone={dirty ? warm : undefined} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'end', padding: 12 }}>
          <Label label="Timeline">
            <select
              value={snapshot.sequence?.id ?? ''}
              onChange={(event) => setActiveCompositionSequenceVariant(event.target.value)}
              style={fieldInputStyle()}
            >
              {project.sequences.map((sequence) => (
                <option key={sequence.id} value={sequence.id}>{sequence.name}</option>
              ))}
            </select>
          </Label>
          <Label label="Traversal">
            <select
              value={snapshot.variant?.id ?? ''}
              onChange={(event) => snapshot.sequence ? setActiveCompositionSequenceVariant(snapshot.sequence.id, event.target.value) : undefined}
              style={fieldInputStyle()}
            >
              {variantIds.map((variantId) => {
                const variant = project.variants.find((candidate) => candidate.id === variantId);
                return variant ? <option key={variant.id} value={variant.id}>{variant.name}</option> : null;
              })}
            </select>
          </Label>
        </div>
        <nav style={{ display: 'flex', alignItems: 'end', justifyContent: 'flex-end', gap: 4, padding: 12, borderLeft: `1px solid ${faintLine}` }}>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'sequence')}>Assembly</ToolbarButton>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'style')}>Look</ToolbarButton>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'automation')}>Motion</ToolbarButton>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'music')}>Sound</ToolbarButton>
        </nav>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr) minmax(310px, 370px)',
        gap: 8,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <Section title="Regions" kicker={<ToolbarButton compact onClick={addRegion}>Add Region</ToolbarButton>}>
          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 8, minHeight: 0, overflow: 'auto', padding: 10 }}>
            {snapshot.scenes.map((region) => (
              <RegionAtlasItem
                key={region.scene.id}
                region={region.scene}
                forceCount={region.layers.length}
                faults={region.diagnostics.length}
                selected={region.scene.id === selectedRegion?.id}
                onClick={() => {
                  setSelectedRegionId(region.scene.id);
                  setSelectedForceId(region.layers[0]?.id);
                }}
              />
            ))}
          </div>
        </Section>

        <Section title={selectedRegion ? `${selectedRegion.name} field` : 'Field'} kicker={selectedForce ? selectedForce.name : undefined}>
          <WorldCanvas
            region={selectedRegion}
            forces={selectedForces}
            selectedForceId={selectedForce?.id}
            assetsById={assetsById}
            cutsById={cutsById}
            onSelectForce={setSelectedForceId}
          />
        </Section>

        <Section title="Shape" kicker={selectedForce?.name ?? selectedRegion?.climate.atmosphere ?? 'neutral'}>
          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 14, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {selectedForce ? (
              <ForceShapePanel
                force={selectedForce}
                asset={selectedForceAsset}
                cut={selectedForceCut}
                forceNameDraft={forceNameDraft}
                onForceNameDraft={setForceNameDraft}
                onCommitForceName={commitForceName}
                onUpdateForce={updateCompositionLayer}
                onMoveForceToRegion={moveForceToRegion}
                onMoveForce={moveForce}
                maxStack={selectedForces.length}
                regions={project.composition.scenes}
              />
            ) : null}

            {selectedRegion ? (
              <div style={{ display: 'grid', gap: 12, paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
                <SceneShapePanel
                  region={selectedRegion}
                  regionNameDraft={regionNameDraft}
                  onRegionNameDraft={setRegionNameDraft}
                  onCommitRegionName={commitRegionName}
                  onUpdateRegion={updateRegionClimate}
                  onUpdateRegionAtmosphere={(value) => updateCompositionScene(selectedRegion.id, { climate: { atmosphere: value } })}
                  canRemove={project.composition.scenes.length > 1}
                  onRemove={removeSelectedRegion}
                />
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
              <span style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>Readiness</span>
              <ValueList items={[
                ['routes', snapshot.selectedScene?.routes.length ?? 0],
                ['entropy', snapshot.selectedScene?.entropyStates.length ?? 0],
                ['preview', <CapabilityBadge available={snapshot.readiness.previewReady}>{snapshot.readiness.previewReady ? 'ready' : 'blocked'}</CapabilityBadge>],
                ['render', <CapabilityBadge available={snapshot.readiness.exportReady}>{snapshot.readiness.exportReady ? 'ready' : 'blocked'}</CapabilityBadge>],
                ['faults', (snapshot.selectedScene?.diagnostics.length ?? 0) + snapshot.selectedLayerDiagnostics.length]
              ]} />
              {snapshot.readiness.reasons.length > 0 ? (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {snapshot.readiness.reasons.slice(0, 4).map((reason) => <WarningChip key={reason} blocking={!snapshot.readiness.exportReady}>{reason}</WarningChip>)}
                </div>
              ) : null}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
