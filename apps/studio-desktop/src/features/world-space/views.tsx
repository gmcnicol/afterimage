import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
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

const passKinds: SceneLayerRenderPassKind[] = ['source', 'mask', 'overlay', 'behaviour', 'diagnostic'];

const line = 'rgba(255,255,255,0.1)';
const faintLine = 'rgba(255,255,255,0.06)';
const ink = '#f6f7f9';

function formatPercent(value: number | undefined): string {
  return value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getVariantsForSequence(projectSequences: Sequence[], sequenceId?: string): string[] {
  return projectSequences.find((sequence) => sequence.id === sequenceId)?.variantIds ?? [];
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
    height: 25,
    border: `1px solid ${line}`,
    background: 'rgba(0,0,0,0.2)',
    color: ink,
    padding: '0 7px',
    font: 'inherit',
    fontSize: 12
  };
}

function Label(props: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>{props.label}</span>
      {props.children}
    </label>
  );
}

function Metric(props: { label: string; value: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ color: muted }}>{props.label}</span>
      <span>{props.value}</span>
    </span>
  );
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

function Section(props: { title: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{
      minWidth: 0,
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: '30px minmax(0, 1fr)',
      border: `1px solid ${line}`,
      background: 'rgba(8,10,14,0.72)',
      overflow: 'hidden',
      ...props.style
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minWidth: 0,
        padding: '0 10px',
        borderBottom: `1px solid ${faintLine}`
      }}>
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{props.title}</h2>
      </header>
      {props.children}
    </section>
  );
}

function ValueList(props: { items: Array<[string, ReactNode]> }) {
  return (
    <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
      {props.items.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
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
        gap: 5,
        width: '100%',
        minWidth: 0,
        padding: '10px 0',
        border: 0,
        borderBottom: `1px solid ${faintLine}`,
        background: 'transparent',
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
        color: props.selected ? ink : 'rgba(246,247,249,0.72)'
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}>{props.region.name}</span>
        <span>{props.selected ? 'open' : 'enter'}</span>
      </span>
      <span style={{ display: 'flex', gap: 12, color: muted, flexWrap: 'wrap' }}>
        <Metric label="air" value={props.region.climate.atmosphere ?? '-'} />
        <Metric label="pressure" value={formatPercent(props.region.climate.pressure)} />
        <Metric label="forces" value={props.forceCount} />
        <Metric label="faults" value={props.faults} />
      </span>
    </button>
  );
}

function ForceName(props: {
  force: NormalizedSceneLayerDefinition;
  selected: boolean;
  index: number;
  total: number;
  onSelect: () => void;
}) {
  const point = orbitPoint(props.index, Math.max(props.total, 1), props.total <= 2 ? 27 : 34);
  return (
    <button
      type="button"
      onClick={props.onSelect}
      style={{
        position: 'absolute',
        left: point.left,
        top: point.top,
        transform: 'translate(-50%, -50%)',
        width: 150,
        minHeight: 38,
        border: `1px solid ${props.selected ? 'rgba(255,255,255,0.55)' : line}`,
        background: props.selected ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.2)',
        color: ink,
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'left',
        padding: '7px 8px'
      }}
    >
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.force.name}</span>
      <span style={{ display: 'block', color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {props.force.contribution} / {props.force.renderIntent.passKind} / {formatPercent(props.force.mix)}
      </span>
    </button>
  );
}

function WorldCanvas(props: {
  region?: NormalizedSceneDefinition;
  forces: NormalizedSceneLayerDefinition[];
  selectedForceId?: string;
  onSelectForce: (forceId: string) => void;
}) {
  return (
    <div style={{
      position: 'relative',
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
      background:
        'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      backgroundSize: '44px 44px'
    }}>
      <div style={{
        position: 'absolute',
        inset: '10% 12%',
        border: `1px solid ${faintLine}`
      }} />
      <div style={{
        position: 'absolute',
        inset: '18% 21%',
        border: `1px solid ${faintLine}`
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '34%',
        maxWidth: 330,
        minWidth: 220,
        transform: 'translate(-50%, -50%)',
        display: 'grid',
        gap: 8,
        textAlign: 'center'
      }}>
        <span style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>active region</span>
        <strong style={{ fontSize: 32, lineHeight: 1.02, fontWeight: 500 }}>{props.region?.name ?? 'Uncharted'}</strong>
        <span style={{ color: muted }}>
          {props.region?.climate.atmosphere ?? 'neutral'} / pressure {formatPercent(props.region?.climate.pressure)} / entropy {formatPercent(props.region?.climate.entropyBias)}
        </span>
      </div>
      {props.forces.map((force, index) => (
        <ForceName
          key={force.id}
          force={force}
          index={index}
          total={props.forces.length}
          selected={force.id === props.selectedForceId}
          onSelect={() => props.onSelectForce(force.id)}
        />
      ))}
      <div style={{ position: 'absolute', left: 14, bottom: 12, right: 14, display: 'grid', gap: 7 }}>
        <span style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>field notes</span>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Metric label="cohesion" value={formatPercent(props.region?.climate.cohesion)} />
          <Metric label="memory" value={formatPercent(props.region?.climate.memory)} />
          <Metric label="volatility" value={formatPercent(props.region?.climate.volatility)} />
          <Metric label="motifs" value={props.region?.climate.motifIds?.join(', ') || '-'} />
          <Metric label="materials" value={props.region?.climate.materialTags?.join(', ') || '-'} />
        </div>
      </div>
    </div>
  );
}

export function WorldSpaceView() {
  const project = useProjectSessionStore((state) => state.project);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setActiveCompositionSequenceVariant = useProjectSessionStore((state) => state.setActiveCompositionSequenceVariant);
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
  const updateRegionClimate = (climate: Partial<SceneClimate>) => {
    if (selectedRegion) {
      updateCompositionScene(selectedRegion.id, { climate });
    }
  };

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
        minHeight: 78,
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 1fr) minmax(420px, 1.2fr) auto',
        border: `1px solid ${line}`,
        background: 'rgba(8,10,14,0.78)'
      }}>
        <div style={{ display: 'grid', alignContent: 'center', gap: 8, minWidth: 0, padding: '10px 12px', borderRight: `1px solid ${faintLine}` }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1, fontWeight: 500 }}>{snapshot.compositionName}</h1>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', color: muted }}>
            <Metric label="regions" value={snapshot.scenes.length} />
            <Metric label="forces" value={snapshot.scenes.reduce((count, scene) => count + scene.layers.length, 0)} />
            <Metric label="memory" value={project.composition.acceptedArchiveReferences.length} />
            <Metric label="capture" value={<CaptureTrustChip state={getCaptureTrustState(snapshot.readiness.previewReady, snapshot.readiness.exportReady)} label={snapshot.readiness.exportReady ? 'ready' : 'blocked'} />} />
            <Metric label="state" value={dirty ? 'dirty' : 'saved'} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'end', padding: 10 }}>
          <Label label="Timeline source">
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
          <Label label="World traversal">
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
        <nav style={{ display: 'flex', alignItems: 'end', justifyContent: 'flex-end', gap: 4, padding: 10, borderLeft: `1px solid ${faintLine}` }}>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'sequence')}>Assembly</ToolbarButton>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'style')}>Look</ToolbarButton>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'automation')}>Motion</ToolbarButton>
          <ToolbarButton onClick={() => setWorkspaceSurface('world', 'music')}>Sound</ToolbarButton>
        </nav>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(230px, 300px) minmax(0, 1fr) minmax(300px, 360px)',
        gap: 8,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <Section title="Atlas">
          <div className="studio-scrollable" style={{ minHeight: 0, overflow: 'auto', padding: '0 10px' }}>
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

        <Section title={selectedRegion ? `${selectedRegion.name} field` : 'Field'}>
          <WorldCanvas
            region={selectedRegion}
            forces={selectedForces}
            selectedForceId={selectedForce?.id}
            onSelectForce={setSelectedForceId}
          />
        </Section>

        <Section title="Sculpt">
          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 12, minHeight: 0, overflow: 'auto', padding: 10 }}>
            {selectedRegion ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Region climate</h3>
                <Label label="Name">
                  <input
                    value={regionNameDraft}
                    onChange={(event) => setRegionNameDraft(event.target.value)}
                    onBlur={commitRegionName}
                    style={fieldInputStyle()}
                  />
                </Label>
                <Label label="Atmosphere">
                  <input
                    value={selectedRegion.climate.atmosphere ?? ''}
                    onChange={(event) => updateCompositionScene(selectedRegion.id, { climate: { atmosphere: event.target.value } })}
                    style={fieldInputStyle()}
                  />
                </Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <PrimitiveScalarControl
                    valueKind="pressure"
                    value={selectedRegion.climate.pressure ?? 0}
                    onChange={(value) => updateRegionClimate({ pressure: value })}
                  />
                  <PrimitiveScalarControl
                    valueKind="entropy"
                    value={selectedRegion.climate.entropyBias ?? 0}
                    onChange={(value) => updateRegionClimate({ entropyBias: value })}
                  />
                  <PrimitiveScalarControl
                    valueKind="cohesion"
                    value={selectedRegion.climate.cohesion ?? 1}
                    onChange={(value) => updateRegionClimate({ cohesion: value })}
                  />
                  <PrimitiveScalarControl
                    valueKind="memory"
                    value={selectedRegion.climate.memory ?? 0}
                    onChange={(value) => updateRegionClimate({ memory: value })}
                  />
                  <PrimitiveScalarControl
                    valueKind="emergence"
                    value={selectedRegion.climate.transitionTendency ?? 0}
                    onChange={(value) => updateRegionClimate({ transitionTendency: value })}
                  />
                  <PrimitiveScalarControl
                    valueKind="archive-affinity"
                    value={getArchiveAffinity(selectedRegion)}
                    disabled
                  />
                </div>
                <ValueList items={[
                  ['volatility', formatPercent(selectedRegion.climate.volatility)],
                  ['activation', selectedRegion.activation.map((activation) => activation.kind).join(', ') || '-']
                ]} />
              </div>
            ) : null}

            {selectedForce ? (
              <div style={{ display: 'grid', gap: 8, paddingTop: 10, borderTop: `1px solid ${faintLine}` }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Force</h3>
                <Label label="Name">
                  <input
                    value={forceNameDraft}
                    onChange={(event) => setForceNameDraft(event.target.value)}
                    onBlur={commitForceName}
                    style={fieldInputStyle()}
                  />
                </Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <Label label="Stack">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={selectedForce.orderIndex}
                      onChange={(event) => updateCompositionLayer(selectedForce.id, { orderIndex: Number(event.target.value) })}
                      style={fieldInputStyle()}
                    />
                  </Label>
                  <Label label="Influence">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedForce.mix}
                      onChange={(event) => updateCompositionLayer(selectedForce.id, { mix: Number(event.target.value) })}
                      style={fieldInputStyle()}
                    />
                  </Label>
                </div>
                <Label label="Output">
                  <select
                    value={selectedForce.renderIntent.passKind}
                    onChange={(event) => updateCompositionLayer(selectedForce.id, {
                      renderIntent: { passKind: event.target.value as SceneLayerRenderPassKind }
                    })}
                    style={fieldInputStyle()}
                  >
                    {passKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                </Label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <ToolbarButton compact onClick={() => moveForce(selectedForce, -1)}>Lift</ToolbarButton>
                  <ToolbarButton compact onClick={() => moveForce(selectedForce, 1)}>Sink</ToolbarButton>
                </div>
                <ValueList items={[
                  ['role', selectedForce.contribution],
                  ['scope', selectedForce.scope],
                  ['blend', selectedForce.blendIntent],
                  ['asset', selectedForce.assetId ?? '-'],
                  ['clip', selectedForce.clipId ?? '-'],
                  ['stack', selectedForce.stackId ?? '-'],
                  ['memory', selectedForce.archiveReferenceIds.join(', ') || '-']
                ]} />
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 7, paddingTop: 10, borderTop: `1px solid ${faintLine}` }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Signal</h3>
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
