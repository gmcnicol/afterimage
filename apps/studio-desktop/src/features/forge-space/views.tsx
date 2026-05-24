import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Sequence } from '@afterimage/project-model';
import { ToolbarButton } from '../../app/components/ToolbarButton';
import { muted, pillStyle } from '../../app/styles';
import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { getStudioClient } from '../../lib/studio-client';
import { deriveForgeSnapshot, type ForgeArtifactSnapshot, type ForgeDiagnosticSnapshot, type ForgeProfileLane } from '../../shared/forge-space';

const line = 'rgba(255,255,255,0.1)';
const faintLine = 'rgba(255,255,255,0.06)';
const ink = '#f6f7f9';
const warn = '#e6c7b8';

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

function formatProgress(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '-';
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
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.value}</span>
    </span>
  );
}

function Surface(props: { title: string; children: ReactNode; style?: CSSProperties; bodyStyle?: CSSProperties }) {
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
      <div style={{ minWidth: 0, minHeight: 0, ...props.bodyStyle }}>
        {props.children}
      </div>
    </section>
  );
}

function LaneStatePill(props: { state: ForgeProfileLane['state'] }) {
  const tone = props.state === 'completed'
    ? 'success'
    : props.state === 'failed'
      ? 'warn'
      : 'default';
  return <span style={pillStyle(tone)}>{props.state}</span>;
}

function ArtifactButton(props: {
  artifact: ForgeArtifactSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      style={{
        display: 'grid',
        gap: 4,
        minWidth: 0,
        border: `1px solid ${props.selected ? 'rgba(246,247,249,0.52)' : faintLine}`,
        background: props.selected ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        color: ink,
        cursor: 'pointer',
        font: 'inherit',
        padding: '7px 8px',
        textAlign: 'left'
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{formatPathTail(props.artifact.path)}</strong>
        <span style={{ color: props.artifact.final ? '#b8d7ba' : muted }}>{props.artifact.final ? 'final' : 'preview'}</span>
      </span>
      <span style={{ color: muted, fontSize: 11 }}>{props.artifact.role}</span>
    </button>
  );
}

function DiagnosticButton(props: {
  diagnostic: ForgeDiagnosticSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      style={{
        minWidth: 0,
        border: `1px solid ${props.selected ? 'rgba(246,247,249,0.52)' : faintLine}`,
        background: props.selected ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        color: props.diagnostic.severity === 'error' ? warn : ink,
        cursor: 'pointer',
        font: 'inherit',
        padding: '7px 8px',
        textAlign: 'left',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      {props.diagnostic.code}: {props.diagnostic.message}
    </button>
  );
}

function ProfileLane(props: {
  lane: ForgeProfileLane;
  selectedDetailId?: string;
  onSelectDetail: (detailId: string) => void;
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  const latestJob = props.lane.latestJob;
  const busy = latestJob?.status === 'queued' || latestJob?.status === 'running';
  return (
    <section style={{
      display: 'grid',
      gridTemplateRows: 'auto auto minmax(0, 1fr)',
      gap: 9,
      minWidth: 0,
      border: `1px solid ${props.lane.state === 'failed' ? 'rgba(230,199,184,0.35)' : faintLine}`,
      background: 'rgba(0,0,0,0.16)',
      padding: 10
    }}>
      <button
        type="button"
        onClick={() => props.onSelectDetail(`profile:${props.lane.profileId}`)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 10,
          minWidth: 0,
          border: 0,
          background: 'transparent',
          color: ink,
          cursor: 'pointer',
          font: 'inherit',
          padding: 0,
          textAlign: 'left'
        }}
      >
        <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.lane.profile?.name ?? props.lane.profileId}</strong>
          <span style={{ color: muted, fontSize: 11 }}>
            {props.lane.enabled ? 'enabled profile' : 'profile from prior job'}
          </span>
        </span>
        <LaneStatePill state={props.lane.state} />
      </button>

      <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', color: muted }}>
        <Metric label="jobs" value={props.lane.jobs.length} />
        <Metric label="progress" value={formatProgress(latestJob?.progress)} />
        <Metric label="output" value={formatPathTail(props.lane.outputPath)} />
      </div>

      <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 8, minHeight: 0, overflow: 'auto' }}>
        {latestJob ? (
          <button
            type="button"
            onClick={() => props.onSelectDetail(`job:${latestJob.id}`)}
            style={{
              display: 'grid',
              gap: 4,
              minWidth: 0,
              border: `1px solid ${props.selectedDetailId === `job:${latestJob.id}` ? 'rgba(246,247,249,0.52)' : faintLine}`,
              background: 'rgba(255,255,255,0.03)',
              color: ink,
              cursor: 'pointer',
              font: 'inherit',
              padding: '7px 8px',
              textAlign: 'left'
            }}
          >
            <strong style={{ fontSize: 12 }}>{latestJob.status} job</strong>
            <span style={{ color: latestJob.error ? warn : muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {latestJob.error ?? latestJob.log.at(-1) ?? latestJob.id}
            </span>
          </button>
        ) : (
          <div style={{ color: muted, border: `1px dashed ${faintLine}`, padding: 9 }}>No forge job for this profile yet.</div>
        )}

        {props.lane.artifacts.map((artifact) => (
          <ArtifactButton
            key={artifact.id}
            artifact={artifact}
            selected={props.selectedDetailId === artifact.id}
            onSelect={() => props.onSelectDetail(artifact.id)}
          />
        ))}

        {props.lane.diagnostics.map((diagnostic) => (
          <DiagnosticButton
            key={diagnostic.id}
            diagnostic={diagnostic}
            selected={props.selectedDetailId === diagnostic.id}
            onSelect={() => props.onSelectDetail(diagnostic.id)}
          />
        ))}

        {latestJob?.status === 'failed' || busy ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {latestJob.status === 'failed' ? <ToolbarButton onClick={() => props.onRetry(latestJob.id)}>Retry</ToolbarButton> : null}
            {busy ? <ToolbarButton onClick={() => props.onCancel(latestJob.id)}>Cancel</ToolbarButton> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ForgeSpaceView() {
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const setActiveCompositionSequenceVariant = useProjectSessionStore((state) => state.setActiveCompositionSequenceVariant);
  const toggleProfile = useProjectSessionStore((state) => state.toggleExportProfile);
  const jobs = useJobsStore((state) => state.jobs);
  const diagnostics = useDiagnosticsStore((state) => state.report);
  const logs = useDiagnosticsStore((state) => state.logs);
  const [selectedCaptureLogId, setSelectedCaptureLogId] = useState<string>();
  const [selectedProfileId, setSelectedProfileId] = useState<string>();
  const [selectedDetailId, setSelectedDetailId] = useState<string>();
  const snapshot = useMemo(
    () => deriveForgeSnapshot({
      project,
      projectRoot,
      selectedCaptureLogId,
      selectedProfileId,
      selectedDetailId,
      jobs,
      diagnostics
    }),
    [project, projectRoot, selectedCaptureLogId, selectedProfileId, selectedDetailId, jobs, diagnostics]
  );
  const variantIds = useMemo(() => getVariantsForSequence(project.sequences, snapshot.sequence?.id), [project.sequences, snapshot.sequence?.id]);
  const activeJobs = snapshot.lanes.flatMap((lane) => lane.jobs.filter((job) => job.status === 'queued' || job.status === 'running'));
  const failedJobs = snapshot.lanes.flatMap((lane) => lane.jobs.filter((job) => job.status === 'failed'));

  useEffect(() => {
    setSelectedCaptureLogId((current) => current && project.captureLogs.some((log) => log.id === current)
      ? current
      : snapshot.latestCaptureLog?.id);
  }, [project.captureLogs, snapshot.latestCaptureLog?.id]);

  useEffect(() => {
    setSelectedProfileId((current) => current && snapshot.allProfiles.some((profile) => profile.id === current)
      ? current
      : snapshot.enabledProfiles[0]?.id ?? snapshot.allProfiles[0]?.id);
  }, [snapshot.allProfiles, snapshot.enabledProfiles]);

  const forgeTraversal = () => {
    if (!snapshot.readiness.ready || !snapshot.variant || !snapshot.outputPath) {
      return;
    }

    void getStudioClient().jobs.runExport({
      project,
      projectRoot,
      outputPath: snapshot.outputPath,
      profileIds: snapshot.enabledProfiles.map((profile) => profile.id),
      selections: project.exportSelections,
      sequenceId: snapshot.sequence?.id,
      variantId: snapshot.variant.id
    });
  };

  const forgeReplay = () => {
    if (!snapshot.replayReadiness.ready || !snapshot.variant || !snapshot.outputPath || !snapshot.selectedCaptureLog) {
      return;
    }

    void getStudioClient().jobs.runExport({
      project,
      projectRoot,
      outputPath: `${snapshot.outputPath}-${snapshot.selectedCaptureLog.id}-replay`,
      profileIds: snapshot.enabledProfiles.map((profile) => profile.id),
      selections: project.exportSelections,
      sequenceId: snapshot.sequence?.id,
      variantId: snapshot.variant.id,
      captureSessionId: snapshot.selectedCaptureSession?.id,
      captureLogId: snapshot.selectedCaptureLog.id
    });
  };

  const retryJob = (jobId: string) => {
    void getStudioClient().jobs.retry(jobId);
  };

  const cancelJob = (jobId: string) => {
    void getStudioClient().jobs.cancel(jobId);
  };

  return (
    <div
      aria-label="Forge Space"
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
        gridTemplateColumns: 'minmax(260px, 1fr) minmax(420px, 1.15fr) minmax(260px, 0.75fr)',
        border: `1px solid ${line}`,
        background: 'rgba(8,10,14,0.78)'
      }}>
        <div style={{ display: 'grid', alignContent: 'center', gap: 8, minWidth: 0, padding: '10px 12px', borderRight: `1px solid ${faintLine}` }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1, fontWeight: 500 }}>{snapshot.compositionName}</h1>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', color: muted }}>
            <Metric label="sequence" value={snapshot.sequence?.name ?? 'none'} />
            <Metric label="variant" value={snapshot.variant?.name ?? 'none'} />
            <Metric label="trust" value={snapshot.resolverOk && snapshot.integrityDiagnostics.length === 0 ? 'resolved' : 'needs review'} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'end', padding: 10 }}>
          <Label label="Traversal source">
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
          <Metric label="replay source" value={snapshot.selectedCaptureLog?.id ?? 'none'} />
          <Metric label="active forge" value={snapshot.activeJobCount} />
          <Metric label="failed forge" value={snapshot.failedJobCount} />
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 315px) minmax(0, 1fr) minmax(300px, 360px)',
        gap: 8,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <Surface title="Forge Sources" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 12, padding: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Traversal source</h3>
            <Metric label="clips" value={snapshot.variant?.clips.length ?? 0} />
            <Metric label="base output" value={formatPathTail(snapshot.outputPath)} />
            <Metric label="readiness" value={snapshot.readiness.ready ? 'forge ready' : snapshot.readiness.reasons[0] ?? 'blocked'} />
          </div>

          <div style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Replay source</h3>
            <Label label="Capture log">
              <select
                value={selectedCaptureLogId ?? ''}
                onChange={(event) => {
                  const value = event.target.value || undefined;
                  setSelectedCaptureLogId(value);
                  setSelectedDetailId(value ? `capture-log:${value}` : undefined);
                }}
                style={fieldStyle()}
              >
                {project.captureLogs.length === 0 ? <option value="">No replay source</option> : null}
                {project.captureLogs.map((log) => (
                  <option key={log.id} value={log.id}>{log.id} ({log.events.length} events)</option>
                ))}
              </select>
            </Label>
            <div style={{ display: 'grid', gap: 5, color: muted }}>
              <Metric label="session" value={snapshot.selectedCaptureSession?.id ?? '-'} />
              <Metric label="started" value={formatTime(snapshot.selectedCaptureSession?.startedAt)} />
              <Metric label="events" value={snapshot.captureEvents.length} />
              <Metric label="replay critical" value={snapshot.replayCriticalEvents.length} />
            </div>
          </div>

          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 8, minHeight: 0, overflow: 'auto', paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Enabled profiles</h3>
            {snapshot.allProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSelectedProfileId(profile.id);
                  setSelectedDetailId(`profile:${profile.id}`);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 8,
                  minWidth: 0,
                  border: `1px solid ${profile.selected ? 'rgba(246,247,249,0.52)' : faintLine}`,
                  background: profile.selected ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                  color: ink,
                  cursor: 'pointer',
                  font: 'inherit',
                  padding: '8px 9px',
                  textAlign: 'left'
                }}
              >
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.profile.name}</strong>
                  <span style={{ color: muted, fontSize: 11 }}>{profile.profile.width} x {profile.profile.height} / {profile.profile.container}</span>
                </span>
                <input
                  aria-label={`Enable ${profile.profile.name}`}
                  type="checkbox"
                  checked={profile.enabled}
                  onChange={(event) => {
                    event.stopPropagation();
                    toggleProfile(profile.id);
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              </button>
            ))}
          </div>
        </Surface>

        <Surface title="Artifact Console" bodyStyle={{ minHeight: 0, overflow: 'hidden' }}>
          <div className="studio-scrollable" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignContent: 'start', gap: 10, minHeight: 0, height: '100%', overflow: 'auto', padding: 10 }}>
            {snapshot.lanes.length > 0 ? snapshot.lanes.map((lane) => (
              <ProfileLane
                key={lane.profileId}
                lane={lane}
                selectedDetailId={selectedDetailId}
                onSelectDetail={setSelectedDetailId}
                onRetry={retryJob}
                onCancel={cancelJob}
              />
            )) : (
              <div style={{ border: `1px dashed ${faintLine}`, padding: 16, color: muted }}>
                Enable a forge profile to create traversal artifacts.
              </div>
            )}
          </div>
        </Surface>

        <Surface title="Selected Detail" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0, overflow: 'hidden' }}>
          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 14, minHeight: 0, overflow: 'auto', padding: 10 }}>
            <div style={{ display: 'grid', gap: 7 }}>
              <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>{snapshot.selectedDetail.kind}</span>
              <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.1, fontWeight: 500 }}>{snapshot.selectedDetail.label}</h3>
              <p style={{ margin: 0, color: ink, lineHeight: 1.45 }}>{snapshot.selectedDetail.semantic}</p>
            </div>
            <div style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: `1px solid ${faintLine}` }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Backend detail</h3>
              <p style={{ margin: 0, color: muted, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{snapshot.selectedDetail.backend}</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {snapshot.selectedDetail.properties.map(([key, value]) => (
                  <Metric key={key} label={key} value={String(value)} />
                ))}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      <section
        aria-label="Forge recovery and diagnostics strip"
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
            <Metric label="forge readiness" value={snapshot.readiness.ready ? 'ready' : snapshot.readiness.reasons[0] ?? 'blocked'} />
            <Metric label="replay forge" value={snapshot.replayReadiness.ready ? 'ready' : snapshot.replayReadiness.reasons[0] ?? 'blocked'} />
            <Metric label="artifacts" value={snapshot.artifacts.length} />
            <Metric label="diagnostics" value={snapshot.diagnostics.length} />
            <Metric label="recent log" value={logs.at(-1)?.message ?? diagnostics?.logs.at(-1)?.message ?? '-'} />
          </div>
          {failedJobs.length > 0 || activeJobs.length > 0 || snapshot.warnings.length > 0 || snapshot.missingMedia.length > 0 || snapshot.toolchainWarnings.length > 0 ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: failedJobs.length > 0 ? warn : muted }}>
              {failedJobs.slice(0, 2).map((job) => <span key={job.id}>Failed: {job.error ?? job.id}</span>)}
              {activeJobs.slice(0, 2).map((job) => <span key={job.id}>Running: {job.target} {formatProgress(job.progress)}</span>)}
              {snapshot.warnings.slice(0, 2).map((warning) => <span key={warning}>Warning: {warning}</span>)}
              {snapshot.missingMedia.slice(0, 2).map((item) => <span key={item}>Missing media: {formatPathTail(item)}</span>)}
              {snapshot.toolchainWarnings.slice(0, 2).map((warning) => <span key={warning}>Toolchain: {warning}</span>)}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {failedJobs[0] ? <ToolbarButton onClick={() => retryJob(failedJobs[0].id)}>Retry Failed</ToolbarButton> : null}
          {activeJobs[0] ? <ToolbarButton onClick={() => cancelJob(activeJobs[0].id)}>Cancel Active</ToolbarButton> : null}
          <ToolbarButton primary disabled={!snapshot.readiness.ready} onClick={forgeTraversal}>Forge Traversal</ToolbarButton>
          <ToolbarButton disabled={!snapshot.replayReadiness.ready} onClick={forgeReplay}>Forge Replay</ToolbarButton>
        </div>
      </section>
    </div>
  );
}
