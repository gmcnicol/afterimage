import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SceneLayerRenderPassKind, Sequence } from '@afterimage/project-model';
import { ToolbarButton } from '../../app/components/ToolbarButton';
import { muted } from '../../app/styles';
import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import { getStudioClient } from '../../lib/studio-client';
import { derivePerformanceSnapshot, type PerformanceSceneSnapshot } from './helpers';

const passKinds: SceneLayerRenderPassKind[] = ['source', 'mask', 'overlay', 'behaviour', 'diagnostic'];
const line = 'rgba(255,255,255,0.1)';
const faintLine = 'rgba(255,255,255,0.06)';
const ink = '#f6f7f9';

function formatPercent(value: number | undefined): string {
  return value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function formatTime(value: string | undefined): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function formatPathTail(path: string | undefined): string {
  if (!path) {
    return '-';
  }

  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-3).join('/');
}

function getVariantsForSequence(projectSequences: Sequence[], sequenceId?: string): string[] {
  return projectSequences.find((sequence) => sequence.id === sequenceId)?.variantIds ?? [];
}

function fieldStyle(): CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    height: 28,
    border: `1px solid ${line}`,
    background: 'rgba(0,0,0,0.24)',
    color: ink,
    padding: '0 8px',
    font: 'inherit',
    fontSize: 12
  };
}

function rangeStyle(): CSSProperties {
  return {
    width: '100%',
    accentColor: '#9db1ca'
  };
}

function Label(props: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
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

function Surface(props: { title: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{
      minWidth: 0,
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: '32px minmax(0, 1fr)',
      border: `1px solid ${line}`,
      background: 'rgba(8,10,14,0.76)',
      overflow: 'hidden',
      ...props.style
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
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

function SceneSetListItem(props: {
  sceneSnapshot: PerformanceSceneSnapshot;
  selected: boolean;
  onClick: () => void;
}) {
  const { scene, layers, diagnostics } = props.sceneSnapshot;
  const readiness = diagnostics.length > 0 ? `${diagnostics.length} issue${diagnostics.length === 1 ? '' : 's'}` : 'ready';

  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        display: 'grid',
        gap: 7,
        width: '100%',
        minWidth: 0,
        border: 0,
        borderBottom: `1px solid ${faintLine}`,
        background: props.selected ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: ink,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        padding: '11px 10px'
      }}
    >
      <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, minWidth: 0 }}>
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{scene.name}</strong>
        <span style={{ color: props.selected ? '#f6f7f9' : muted }}>{props.selected ? 'active' : 'select'}</span>
      </span>
      <span style={{ display: 'flex', gap: 12, color: muted, flexWrap: 'wrap' }}>
        <Metric label="climate" value={scene.climate.atmosphere ?? 'neutral'} />
        <Metric label="layers" value={layers.length} />
        <Metric label="capture" value={props.sceneSnapshot.captureLogCount} />
      </span>
      <span style={{ display: 'flex', gap: 12, color: muted, flexWrap: 'wrap' }}>
        <Metric label="pressure" value={formatPercent(scene.climate.pressure)} />
        <Metric label="entropy" value={formatPercent(scene.climate.entropyBias)} />
        <Metric label="state" value={readiness} />
      </span>
    </button>
  );
}

function SignalStage(props: {
  snapshotName: string;
  scene?: PerformanceSceneSnapshot;
  selectedLayerId?: string;
  previewState: string;
  replayState: string;
  onSelectLayer: (layerId: string) => void;
}) {
  const layers = props.scene?.layers ?? [];
  return (
    <div
      aria-label="Performance world signal view"
      style={{
        position: 'relative',
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 48% 45%, rgba(157,177,202,0.22), rgba(157,177,202,0.04) 31%, transparent 58%), linear-gradient(145deg, rgba(13,16,22,0.98), rgba(19,24,29,0.94) 48%, rgba(10,12,16,0.98))'
      }}
    >
      <div style={{
        position: 'absolute',
        inset: '12% 16%',
        border: `1px solid ${faintLine}`,
        transform: 'rotate(-4deg)'
      }} />
      <div style={{
        position: 'absolute',
        inset: '24% 25%',
        border: `1px solid rgba(157,177,202,0.24)`,
        transform: 'rotate(7deg)'
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '45%',
        transform: 'translate(-50%, -50%)',
        display: 'grid',
        gap: 8,
        width: 'min(430px, 68%)',
        textAlign: 'center'
      }}>
        <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>active world</span>
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.04, fontWeight: 500 }}>{props.scene?.scene.name ?? props.snapshotName}</h1>
        <span style={{ color: muted }}>
          {props.scene?.scene.climate.atmosphere ?? 'neutral'} / pressure {formatPercent(props.scene?.scene.climate.pressure)} / entropy {formatPercent(props.scene?.scene.climate.entropyBias)}
        </span>
      </div>
      {layers.map((layer, index) => {
        const angle = layers.length <= 1 ? -Math.PI / 2 : (Math.PI * 2 * index) / layers.length - Math.PI / 2;
        const left = 50 + Math.cos(angle) * (layers.length <= 2 ? 28 : 35);
        const top = 48 + Math.sin(angle) * (layers.length <= 2 ? 24 : 31);
        const selected = layer.id === props.selectedLayerId;
        return (
          <button
            key={layer.id}
            type="button"
            onClick={() => props.onSelectLayer(layer.id)}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              transform: 'translate(-50%, -50%)',
              width: 164,
              minHeight: 48,
              border: `1px solid ${selected ? 'rgba(246,247,249,0.6)' : 'rgba(255,255,255,0.12)'}`,
              background: selected ? 'rgba(246,247,249,0.08)' : 'rgba(0,0,0,0.28)',
              color: ink,
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
              padding: '8px 9px'
            }}
          >
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name}</span>
            <span style={{ display: 'block', color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {layer.contribution} / {formatPercent(layer.mix)}
            </span>
          </button>
        );
      })}
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 13, display: 'flex', gap: 18, flexWrap: 'wrap', color: muted }}>
        <Metric label="routes" value={props.scene?.routes.length ?? 0} />
        <Metric label="entropy states" value={props.scene?.entropyStates.length ?? 0} />
        <Metric label="preview" value={props.previewState} />
        <Metric label="replay" value={props.replayState} />
        <Metric label="faults" value={props.scene?.diagnostics.length ?? 0} />
      </div>
    </div>
  );
}

function OutputStrip(props: {
  previewLabel: string;
  replayLabel: string;
  previewProgress?: number;
  replayProgress?: number;
  previewArtifact?: string;
  replayArtifact?: string;
  previewError?: string;
  replayError?: string;
  onCoalesce: () => void;
  onReplay: () => void;
  canPreview: boolean;
  canReplay: boolean;
  previewReasons: string[];
  replayReasons: string[];
}) {
  return (
    <section
      aria-label="Performance preview and replay output strip"
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'center',
        border: `1px solid ${line}`,
        background: 'rgba(8,10,14,0.78)',
        padding: 10,
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', minWidth: 0 }}>
          <Metric label="preview job" value={`${props.previewLabel}${props.previewProgress !== undefined ? ` ${props.previewProgress}%` : ''}`} />
          <Metric label="replay job" value={`${props.replayLabel}${props.replayProgress !== undefined ? ` ${props.replayProgress}%` : ''}`} />
          <Metric label="preview artifact" value={formatPathTail(props.previewArtifact)} />
          <Metric label="replay artifact" value={formatPathTail(props.replayArtifact)} />
        </div>
        {props.previewError || props.replayError ? (
          <div style={{ color: '#e6c7b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {props.previewError ?? props.replayError}
          </div>
        ) : null}
        {!props.canPreview || !props.canReplay ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: muted }}>
            {!props.canPreview ? <span>Coalesce blocked: {props.previewReasons[0] ?? 'not ready'}</span> : null}
            {!props.canReplay ? <span>Replay blocked: {props.replayReasons[0] ?? 'not ready'}</span> : null}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <ToolbarButton primary disabled={!props.canPreview} onClick={props.onCoalesce}>Coalesce</ToolbarButton>
        <ToolbarButton disabled={!props.canReplay} onClick={props.onReplay}>Replay Capture</ToolbarButton>
      </div>
    </section>
  );
}

export function PerformanceSpaceView() {
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const setActiveCompositionSequenceVariant = useProjectSessionStore((state) => state.setActiveCompositionSequenceVariant);
  const updateCompositionScene = useProjectSessionStore((state) => state.updateCompositionScene);
  const updateCompositionLayer = useProjectSessionStore((state) => state.updateCompositionLayer);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);
  const jobs = useJobsStore((state) => state.jobs);
  const diagnostics = useDiagnosticsStore((state) => state.report);
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
  const [selectedLayerId, setSelectedLayerId] = useState<string>();
  const [selectedCaptureLogId, setSelectedCaptureLogId] = useState<string>();
  const snapshot = useMemo(
    () => derivePerformanceSnapshot({
      project,
      projectRoot,
      selectedSceneId,
      selectedLayerId,
      selectedCaptureLogId,
      jobs,
      diagnostics
    }),
    [project, projectRoot, selectedSceneId, selectedLayerId, selectedCaptureLogId, jobs, diagnostics]
  );
  const variantIds = useMemo(() => getVariantsForSequence(project.sequences, snapshot.sequence?.id), [project.sequences, snapshot.sequence?.id]);
  const selectedScene = snapshot.selectedScene?.scene;
  const selectedLayer = snapshot.selectedLayer;

  useEffect(() => {
    setSelectedSceneId((current) => current && snapshot.scenes.some((scene) => scene.scene.id === current)
      ? current
      : snapshot.selectedScene?.scene.id);
  }, [snapshot.scenes, snapshot.selectedScene?.scene.id]);

  useEffect(() => {
    setSelectedLayerId((current) => current && snapshot.selectedScene?.layers.some((layer) => layer.id === current)
      ? current
      : snapshot.selectedLayer?.id);
  }, [snapshot.selectedLayer?.id, snapshot.selectedScene?.layers]);

  useEffect(() => {
    setSelectedCaptureLogId((current) => current && project.captureLogs.some((log) => log.id === current)
      ? current
      : snapshot.latestCaptureLog?.id);
  }, [project.captureLogs, snapshot.latestCaptureLog?.id]);

  const coalescePreview = () => {
    if (!snapshot.readiness.previewReady || !snapshot.variant || !snapshot.previewOutputPath) {
      return;
    }

    setPreviewPath(undefined);
    void getStudioClient().jobs.runPreview({
      project,
      projectRoot,
      sequenceId: snapshot.sequence?.id,
      variantId: snapshot.variant.id,
      outputPath: snapshot.previewOutputPath
    });
  };

  const runCaptureReplay = () => {
    if (!snapshot.readiness.replayReady || !snapshot.variant || !snapshot.replayOutputPath || !snapshot.selectedCaptureLog) {
      return;
    }

    setPreviewPath(undefined);
    void getStudioClient().jobs.runPreview({
      project,
      projectRoot,
      sequenceId: snapshot.sequence?.id,
      variantId: snapshot.variant.id,
      outputPath: snapshot.replayOutputPath,
      captureSessionId: snapshot.selectedCaptureSession?.id,
      captureLogId: snapshot.selectedCaptureLog.id
    });
  };

  return (
    <div
      aria-label="Performance Space"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
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
        minHeight: 74,
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 1fr) minmax(420px, 1.2fr) minmax(260px, 0.7fr)',
        border: `1px solid ${line}`,
        background: 'rgba(8,10,14,0.78)'
      }}>
        <div style={{ display: 'grid', alignContent: 'center', gap: 8, minWidth: 0, padding: '10px 12px', borderRight: `1px solid ${faintLine}` }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1, fontWeight: 500 }}>{snapshot.compositionName}</h1>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', color: muted }}>
            <Metric label="scenes" value={snapshot.scenes.length} />
            <Metric label="forces" value={snapshot.scenes.reduce((count, scene) => count + scene.layers.length, 0)} />
            <Metric label="captures" value={project.captureLogs.length} />
            <Metric label="readiness" value={snapshot.readiness.previewReady ? 'rehearsal ready' : 'blocked'} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'end', padding: 10 }}>
          <Label label="World source">
            <select
              value={snapshot.sequence?.id ?? ''}
              onChange={(event) => setActiveCompositionSequenceVariant(event.target.value)}
              style={fieldStyle()}
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
              style={fieldStyle()}
            >
              {variantIds.map((variantId) => {
                const variant = project.variants.find((candidate) => candidate.id === variantId);
                return variant ? <option key={variant.id} value={variant.id}>{variant.name}</option> : null;
              })}
            </select>
          </Label>
        </div>
        <div style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0, padding: 10, borderLeft: `1px solid ${faintLine}`, color: muted }}>
          <Metric label="capture" value={snapshot.selectedCaptureSession?.id ?? 'none'} />
          <Metric label="started" value={formatTime(snapshot.selectedCaptureSession?.startedAt)} />
          <Metric label="events" value={snapshot.selectedCaptureLog?.events.length ?? 0} />
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(230px, 300px) minmax(0, 1fr) minmax(300px, 360px)',
        gap: 8,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <Surface title="Rehearsal Set">
          <div className="studio-scrollable" style={{ minHeight: 0, overflow: 'auto' }}>
            {snapshot.scenes.map((scene) => (
              <SceneSetListItem
                key={scene.scene.id}
                sceneSnapshot={scene}
                selected={scene.scene.id === selectedScene?.id}
                onClick={() => {
                  setSelectedSceneId(scene.scene.id);
                  setSelectedLayerId(scene.layers[0]?.id);
                }}
              />
            ))}
          </div>
        </Surface>

        <Surface title={selectedScene ? `${selectedScene.name} universe` : 'Universe'}>
          <SignalStage
            snapshotName={snapshot.compositionName}
            scene={snapshot.selectedScene}
            selectedLayerId={selectedLayer?.id}
            previewState={snapshot.previewJob.label}
            replayState={snapshot.replayJob.label}
            onSelectLayer={setSelectedLayerId}
          />
        </Surface>

        <Surface title="Live Controls">
          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 13, minHeight: 0, overflow: 'auto', padding: 10 }}>
            {selectedScene ? (
              <div style={{ display: 'grid', gap: 9 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Region climate</h3>
                <Label label={`Pressure ${formatPercent(selectedScene.climate.pressure)}`}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedScene.climate.pressure ?? 0}
                    onChange={(event) => updateCompositionScene(selectedScene.id, { climate: { pressure: Number(event.target.value) } })}
                    style={rangeStyle()}
                  />
                </Label>
                <Label label={`Entropy ${formatPercent(selectedScene.climate.entropyBias)}`}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedScene.climate.entropyBias ?? 0}
                    onChange={(event) => updateCompositionScene(selectedScene.id, { climate: { entropyBias: Number(event.target.value) } })}
                    style={rangeStyle()}
                  />
                </Label>
                <Label label="Atmosphere">
                  <input
                    value={selectedScene.climate.atmosphere ?? ''}
                    onChange={(event) => updateCompositionScene(selectedScene.id, { climate: { atmosphere: event.target.value } })}
                    style={fieldStyle()}
                  />
                </Label>
              </div>
            ) : null}

            {selectedLayer ? (
              <div style={{ display: 'grid', gap: 9, paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Selected force</h3>
                <Metric label="layer" value={selectedLayer.name} />
                <Label label={`Influence ${formatPercent(selectedLayer.mix)}`}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedLayer.mix}
                    onChange={(event) => updateCompositionLayer(selectedLayer.id, { mix: Number(event.target.value) })}
                    style={rangeStyle()}
                  />
                </Label>
                <Label label="Render intent">
                  <select
                    value={selectedLayer.renderIntent.passKind}
                    onChange={(event) => updateCompositionLayer(selectedLayer.id, {
                      renderIntent: { passKind: event.target.value as SceneLayerRenderPassKind }
                    })}
                    style={fieldStyle()}
                  >
                    {passKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                </Label>
                <div style={{ display: 'grid', gap: 6, color: muted }}>
                  <Metric label="role" value={selectedLayer.contribution} />
                  <Metric label="scope" value={selectedLayer.scope} />
                  <Metric label="blend" value={selectedLayer.blendIntent} />
                  <Metric label="routes" value={snapshot.selectedLayerRoutes.length} />
                  <Metric label="entropy" value={snapshot.selectedLayerEntropyStates.length} />
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 9, paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Capture source</h3>
              <Label label="Replay log">
                <select
                  value={selectedCaptureLogId ?? ''}
                  onChange={(event) => setSelectedCaptureLogId(event.target.value || undefined)}
                  style={fieldStyle()}
                >
                  {project.captureLogs.length === 0 ? <option value="">No captures</option> : null}
                  {project.captureLogs.map((log) => (
                    <option key={log.id} value={log.id}>{log.id} ({log.events.length} events)</option>
                  ))}
                </select>
              </Label>
              <div style={{ display: 'grid', gap: 6, color: muted }}>
                <Metric label="session" value={snapshot.selectedCaptureSession?.id ?? '-'} />
                <Metric label="status" value={snapshot.selectedCaptureSession?.status ?? '-'} />
                <Metric label="timebase" value={snapshot.selectedCaptureSession?.timebase.kind ?? '-'} />
              </div>
            </div>
          </div>
        </Surface>
      </div>

      <OutputStrip
        previewLabel={snapshot.previewJob.label}
        replayLabel={snapshot.replayJob.label}
        previewProgress={snapshot.previewJob.progress}
        replayProgress={snapshot.replayJob.progress}
        previewArtifact={snapshot.previewJob.lastArtifactPath}
        replayArtifact={snapshot.replayJob.lastArtifactPath}
        previewError={snapshot.previewJob.error}
        replayError={snapshot.replayJob.error}
        onCoalesce={coalescePreview}
        onReplay={runCaptureReplay}
        canPreview={snapshot.readiness.previewReady}
        canReplay={snapshot.readiness.replayReady}
        previewReasons={snapshot.readiness.previewReasons}
        replayReasons={snapshot.readiness.replayReasons}
      />
    </div>
  );
}
