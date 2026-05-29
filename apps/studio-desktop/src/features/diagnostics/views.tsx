import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  NormalizedProjectFile,
  RuntimePerformanceProfile,
  RuntimePerformanceProfileKind,
  SpatialFieldRuntimeReport
} from '@afterimage/project-model';
import { muted, pillStyle } from '../../app/styles';
import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import {
  behaviouralFieldOverlayCopy,
  behaviouralFieldOverlayModes,
  fieldIdFromSpatialSignalId,
  resolveFieldOverlayMode,
  resolveNextFieldSelectionFromSignal,
  resolveNextSignalSelectionFromField,
  deriveObservatorySnapshot,
  type BehaviouralFieldCopy,
  type BehaviouralFieldOverlayMode,
  type ObservatoryLane,
  type ObservatorySignal,
  type ObservatorySignalSeverity
} from './helpers';

const ink = '#f6f7f9';
const line = 'rgba(255,255,255,0.1)';
const faintLine = 'rgba(255,255,255,0.06)';
const runtimeProfileKinds: RuntimePerformanceProfileKind[] = ['draft', 'live', 'studio', 'render'];

const runtimeProfileQualityCopy: Record<RuntimePerformanceProfileKind, {
  label: string;
  stability: string;
  persistence: string;
  detail: string;
  depth: string;
  resolution: string;
}> = {
  draft: {
    label: 'Draft',
    stability: 'fast check',
    persistence: 'short memory',
    detail: 'light',
    depth: 'shallow',
    resolution: 'reduced'
  },
  live: {
    label: 'Live',
    stability: 'responsive',
    persistence: 'active memory',
    detail: 'medium',
    depth: 'rehearsal',
    resolution: 'balanced'
  },
  studio: {
    label: 'Studio',
    stability: 'steady',
    persistence: 'held memory',
    detail: 'rich',
    depth: 'layered',
    resolution: 'full'
  },
  render: {
    label: 'Render',
    stability: 'locked',
    persistence: 'complete memory',
    detail: 'maximum',
    depth: 'deep',
    resolution: 'source'
  }
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function severityTone(severity: ObservatorySignalSeverity): 'default' | 'success' | 'warn' {
  return severity === 'healthy' ? 'success' : severity === 'blocked' || severity === 'warning' ? 'warn' : 'default';
}

function severityColor(severity: ObservatorySignalSeverity): string {
  switch (severity) {
    case 'blocked':
      return '#e59a9a';
    case 'warning':
      return '#dcc27c';
    case 'healthy':
      return '#8fd3aa';
    case 'info':
      return '#8fb8da';
  }
}

function resolveRuntimeProfile(project: NormalizedProjectFile, kind: RuntimePerformanceProfileKind): RuntimePerformanceProfile | undefined {
  return project.runtimeProfiles.find((profile) => profile.kind === kind)
    ?? project.runtimeProfiles.find((profile) => profile.kind === 'studio')
    ?? project.runtimeProfiles[0];
}

function ProfileSelector(props: {
  selectedKind: RuntimePerformanceProfileKind;
  profiles: RuntimePerformanceProfile[];
  onChange: (kind: RuntimePerformanceProfileKind) => void;
}) {
  const availableKinds = props.profiles.length > 0
    ? new Set(props.profiles.map((profile) => profile.kind))
    : new Set(runtimeProfileKinds);

  return (
    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>Profile</span>
      <div role="group" aria-label="Observatory runtime profile" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {runtimeProfileKinds.map((kind) => {
          const selected = props.selectedKind === kind;
          const disabled = !availableKinds.has(kind);
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => props.onChange(kind)}
              style={{
                border: `1px solid ${selected ? '#8fb8da' : faintLine}`,
                background: selected ? 'rgba(143,184,218,0.18)' : 'rgba(0,0,0,0.22)',
                color: disabled ? 'rgba(246,247,249,0.38)' : ink,
                cursor: disabled ? 'not-allowed' : 'pointer',
                font: 'inherit',
                fontSize: 11,
                minHeight: 28,
                padding: '6px 8px'
              }}
            >
              {runtimeProfileQualityCopy[kind].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Section(props: { title: string; children: ReactNode; style?: CSSProperties; bodyStyle?: CSSProperties }) {
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
      <div style={{ minWidth: 0, minHeight: 0, ...props.bodyStyle }}>{props.children}</div>
    </section>
  );
}

function Metric(props: { label: string; value: ReactNode; tone?: ObservatorySignalSeverity }) {
  return (
    <div style={{
      display: 'grid',
      gap: 5,
      minWidth: 0,
      padding: '9px 10px',
      border: `1px solid ${faintLine}`,
      background: 'rgba(255,255,255,0.025)'
    }}>
      <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>{props.label}</span>
      <strong style={{ color: props.tone ? severityColor(props.tone) : ink, fontSize: 18, lineHeight: 1 }}>{props.value}</strong>
    </div>
  );
}

function SignalButton(props: { signal: ObservatorySignal; selected: boolean; onSelect: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      style={{
        display: 'grid',
        gap: props.compact ? 4 : 6,
        width: '100%',
        minWidth: 0,
        border: `1px solid ${props.selected ? severityColor(props.signal.severity) : faintLine}`,
        background: props.selected ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.18)',
        color: ink,
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'left',
        padding: props.compact ? '7px 8px' : '9px 10px'
      }}
    >
      <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, minWidth: 0, alignItems: 'center' }}>
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: props.compact ? 12 : 13 }}>{props.signal.label}</strong>
        <span style={{ color: severityColor(props.signal.severity), fontSize: 10, textTransform: 'uppercase' }}>{props.signal.severity}</span>
      </span>
      <span style={{
        color: muted,
        fontSize: props.compact ? 11 : 12,
        lineHeight: 1.35,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: props.compact ? 1 : 2,
        WebkitBoxOrient: 'vertical'
      }}>
        {props.signal.summary}
      </span>
    </button>
  );
}

function LaneSummary(props: { lane: ObservatoryLane; selectedSignalId: string; onSelect: (signalId: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <strong>{props.lane.title}</strong>
          <span style={pillStyle(severityTone(props.lane.severity))}>{props.lane.signals.length}</span>
        </div>
        <span style={{ color: muted, lineHeight: 1.35 }}>{props.lane.summary}</span>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {props.lane.signals.slice(0, 4).map((signal) => (
          <SignalButton
            key={signal.id}
            signal={signal}
            selected={signal.id === props.selectedSignalId}
            onSelect={() => props.onSelect(signal.id)}
            compact
          />
        ))}
      </div>
    </div>
  );
}

function SignalMap(props: { signals: ObservatorySignal[]; selectedSignalId: string; onSelect: (signalId: string) => void }) {
  const selected = props.signals.find((signal) => signal.id === props.selectedSignalId);
  const visible = [
    ...(selected ? [selected] : []),
    ...props.signals.filter((signal) => signal.id !== selected?.id).slice(0, 8)
  ];
  const center = visible.find((signal) => signal.id === props.selectedSignalId) ?? visible[0];
  const satellites = visible.filter((signal) => signal.id !== center?.id);

  return (
    <div
      aria-label="Observatory world signal map"
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background:
          'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(140deg, rgba(20,24,28,0.96), rgba(12,15,18,0.97) 52%, rgba(20,19,15,0.96))',
        backgroundSize: '42px 42px, 42px 42px, auto'
      }}
    >
      <div style={{ position: 'absolute', inset: '11% 12%', border: `1px solid ${faintLine}`, transform: 'rotate(-3deg)' }} />
      <div style={{ position: 'absolute', inset: '22% 23%', border: '1px solid rgba(143,211,170,0.2)', transform: 'rotate(6deg)' }} />
      {center ? (
        <button
          type="button"
          onClick={() => props.onSelect(center.id)}
          style={{
            position: 'absolute',
            left: '50%',
            top: '45%',
            transform: 'translate(-50%, -50%)',
            width: 'min(320px, 48%)',
            minHeight: 104,
            display: 'grid',
            gap: 8,
            alignContent: 'center',
            border: `1px solid ${severityColor(center.severity)}`,
            background: 'rgba(0,0,0,0.42)',
            color: ink,
            cursor: 'pointer',
            font: 'inherit',
            textAlign: 'center',
            padding: 14
          }}
        >
          <span style={{ color: severityColor(center.severity), fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>{center.laneId.replace('-', ' ')}</span>
          <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.04, fontWeight: 500, overflowWrap: 'anywhere' }}>{center.label}</h2>
          <span style={{ color: muted, lineHeight: 1.35 }}>{center.summary}</span>
        </button>
      ) : null}
      {satellites.map((signal, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(satellites.length, 1) - Math.PI / 2;
        const radiusX = 38;
        const radiusY = 32;
        const left = Math.max(18, Math.min(82, 50 + Math.cos(angle) * radiusX));
        const top = Math.max(18, Math.min(82, 45 + Math.sin(angle) * radiusY));

        return (
          <button
            key={signal.id}
            type="button"
            onClick={() => props.onSelect(signal.id)}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              transform: 'translate(-50%, -50%)',
              width: 'clamp(88px, 10vw, 136px)',
              minHeight: 42,
              border: `1px solid ${signal.id === props.selectedSignalId ? severityColor(signal.severity) : 'rgba(255,255,255,0.12)'}`,
              borderTop: `2px solid ${severityColor(signal.severity)}`,
              background: 'rgba(0,0,0,0.32)',
              color: ink,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 11,
              textAlign: 'left',
              padding: '6px 7px'
            }}
          >
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signal.label}</span>
            <span style={{ display: 'block', color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {signal.kind.replace('-', ' ')}
            </span>
          </button>
        );
      })}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', color: muted }}>
        {['world-state', 'trust', 'render-graph', 'backend', 'activity'].map((lane) => (
          <span key={lane} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, background: lane === 'trust' ? '#dcc27c' : lane === 'render-graph' ? '#8fb8da' : lane === 'backend' ? '#8fd3aa' : lane === 'activity' ? '#d099c2' : '#e6c36a' }} />
            {lane.replace('-', ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}

function hashFieldValue(value: string, index: number): number {
  let hash = 2166136261;
  const input = `${value}:${index}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

function buildFieldHistogram(report: SpatialFieldRuntimeReport): number[] {
  return Array.from({ length: 10 }, (_, index) => {
    const base = hashFieldValue(report.fieldId, index);
    const storageWeight = report.storageMode === 'gpu-texture' ? 0.35 : 0.2;
    const persistenceWeight = report.previousFrameId ? 0.25 : 0.08;

    return Math.min(1, 0.16 + base * 0.58 + storageWeight + persistenceWeight);
  });
}

function FieldPreview(props: { report: SpatialFieldRuntimeReport; mode: BehaviouralFieldOverlayMode }) {
  const cells = useMemo(() => Array.from({ length: 96 }, (_, index) => hashFieldValue(props.report.fieldId, index)), [props.report.fieldId]);
  const histogram = useMemo(() => buildFieldHistogram(props.report), [props.report]);

  if (props.mode === 'histogram') {
    return (
      <div aria-label="Field balance summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 5, alignItems: 'end', height: '100%', minHeight: 0 }}>
        {histogram.map((value, index) => (
          <div key={index} style={{ display: 'grid', alignItems: 'end', height: '100%', minHeight: 0 }}>
            <div style={{
              minHeight: 4,
              height: `${Math.round(value * 100)}%`,
              background: value > 0.72 ? '#e6c36a' : value > 0.48 ? '#8fb8da' : '#8fd3aa',
              border: `1px solid ${faintLine}`
            }} />
          </div>
        ))}
      </div>
    );
  }

  if (props.mode === 'flow') {
    return (
      <div aria-label="Field drift visualization" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridTemplateRows: 'repeat(8, minmax(0, 1fr))', gap: 4, height: '100%', minHeight: 0 }}>
        {cells.map((value, index) => (
          <div key={index} style={{ display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, background: 'rgba(255,255,255,0.025)' }}>
            <span style={{
              width: `${8 + value * 16}px`,
              height: 2,
              background: value > 0.6 ? '#e6c36a' : '#8fb8da',
              transform: `rotate(${Math.round((value - 0.5) * 160)}deg)`,
              transformOrigin: 'center',
              display: 'block'
            }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div aria-label="Field isolation overlay" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridTemplateRows: 'repeat(8, minmax(0, 1fr))', gap: 2, height: '100%', minHeight: 0 }}>
      {cells.map((value, index) => {
        const alpha = props.mode === 'magnitude' ? 0.2 + value * 0.72 : 0.12 + value * 0.44;
        return (
          <span key={index} style={{
            minWidth: 0,
            minHeight: 0,
            background: props.report.fieldKind === 'motion' || props.report.fieldKind === 'flow_x' || props.report.fieldKind === 'flow_y'
              ? `rgba(230,195,106,${alpha})`
              : `rgba(143,184,218,${alpha})`,
            border: value > 0.82 ? '1px solid rgba(255,255,255,0.28)' : '1px solid transparent'
          }} />
        );
      })}
    </div>
  );
}

function FieldRuntimeInspector(props: {
  reports: SpatialFieldRuntimeReport[];
  fieldLanguage: Record<string, BehaviouralFieldCopy>;
  runtimeProfile?: RuntimePerformanceProfile;
  selectedFieldId?: string;
  overlayMode: BehaviouralFieldOverlayMode;
  onSelectField: (fieldId: string) => void;
  onOverlayModeChange: (mode: BehaviouralFieldOverlayMode) => void;
}) {
  const selected = props.reports.find((report) => report.fieldId === props.selectedFieldId) ?? props.reports[0];
  const selectedCopy = selected ? props.fieldLanguage[selected.fieldId] : undefined;
  const selectedModeCopy = behaviouralFieldOverlayCopy[props.overlayMode];
  const profileKind = props.runtimeProfile?.kind ?? 'studio';
  const profileCopy = runtimeProfileQualityCopy[profileKind];

  if (!selected) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 0, color: muted }}>
        No spatial fields.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 8, minHeight: 0, borderTop: `1px solid ${faintLine}`, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', minWidth: 0 }}>
        <div className="studio-scrollable" style={{ display: 'flex', gap: 6, overflow: 'auto', minWidth: 0 }}>
          {props.reports.map((report) => {
            const copy = props.fieldLanguage[report.fieldId];

            return (
              <button
                key={report.fieldId}
                type="button"
                aria-label={`Select ${copy?.label ?? report.fieldKind}`}
                onClick={() => props.onSelectField(report.fieldId)}
                style={{
                  flex: '0 0 auto',
                  maxWidth: 178,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  border: `1px solid ${report.fieldId === selected.fieldId ? severityColor(report.profileFit === 'fits' ? 'healthy' : 'warning') : faintLine}`,
                  background: report.fieldId === selected.fieldId ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.2)',
                  color: ink,
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 11,
                  padding: '6px 8px'
                }}
              >
                {copy?.label ?? report.fieldKind}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {behaviouralFieldOverlayModes.map((mode) => (
            <button
              key={mode}
              type="button"
              title={behaviouralFieldOverlayCopy[mode].help}
              onClick={() => props.onOverlayModeChange(mode)}
              style={{
                border: `1px solid ${props.overlayMode === mode ? '#8fb8da' : faintLine}`,
                background: props.overlayMode === mode ? 'rgba(143,184,218,0.18)' : 'rgba(0,0,0,0.22)',
                color: ink,
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 11,
                padding: '6px 7px'
              }}
            >
              {behaviouralFieldOverlayCopy[mode].label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1fr) minmax(150px, 220px)', gap: 10, minHeight: 0, minWidth: 0 }}>
        <FieldPreview report={selected} mode={props.overlayMode} />
        <div style={{ display: 'grid', alignContent: 'start', gap: 8, minWidth: 0, fontSize: 12 }}>
          <div style={{ display: 'grid', gap: 4, minWidth: 0, paddingBottom: 3 }}>
            <strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCopy?.label ?? selected.fieldKind}</strong>
            <span style={{ color: muted, lineHeight: 1.3 }}>{selectedModeCopy.help}</span>
          </div>
          {[
            ['profile', props.runtimeProfile?.label ?? profileCopy.label],
            ['stability', profileCopy.stability],
            ['persistence', `${profileCopy.persistence} / ${selected.persistencePlan.windowFrames} frame${selected.persistencePlan.windowFrames === 1 ? '' : 's'}`],
            ['detail', profileCopy.detail],
            ['depth', profileCopy.depth],
            ['resolution', `${profileCopy.resolution} / ${selected.dimensions.width} x ${selected.dimensions.height}`]
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
              <span style={{ color: muted }}>{label}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
            </div>
          ))}
          <details style={{ marginTop: 2 }}>
            <summary style={{ color: muted, cursor: 'pointer' }}>Runtime details</summary>
            <div style={{ display: 'grid', gap: 6, minWidth: 0, paddingTop: 8 }}>
              {[
                ['behaviour', selectedCopy?.term.toLowerCase() ?? selected.fieldKind],
                ['context', selectedCopy?.context ?? '-'],
                ['field id', selected.fieldId],
                ['generator id', selected.generatorId ?? '-'],
                ['storage mode', selected.storageMode],
                ['frame id', selected.currentFrameId],
                ['previous frame', selected.previousFrameId ?? '-'],
                ['profile fit', selected.profileFit],
                ['passes', String(selected.updatePasses.length)],
                ['diagnostics', String(selected.diagnostics.length)]
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
                  <span style={{ color: muted }}>{label}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function DetailDrawer(props: { signal: ObservatorySignal }) {
  return (
    <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 12, minHeight: 0, overflow: 'auto', padding: 12 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ ...pillStyle(severityTone(props.signal.severity)), justifySelf: 'start' }}>{props.signal.kind.replace('-', ' ')}</span>
        <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.05, fontWeight: 500, overflowWrap: 'anywhere' }}>{props.signal.detail.title}</h2>
        <p style={{ margin: 0, color: ink, lineHeight: 1.45 }}>{props.signal.detail.semantic}</p>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {props.signal.detail.properties.map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
            <span style={{ color: muted }}>{label}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
          </div>
        ))}
      </div>
      <details>
        <summary style={{ color: muted, cursor: 'pointer' }}>Backend details</summary>
        <pre style={{
          margin: '9px 0 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: muted,
          background: 'rgba(0,0,0,0.22)',
          border: `1px solid ${faintLine}`,
          padding: 10,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          lineHeight: 1.4
        }}>
          {props.signal.detail.backend}
        </pre>
      </details>
    </div>
  );
}

function EventStrip(props: { signals: ObservatorySignal[]; selectedSignalId: string; onSelect: (signalId: string) => void }) {
  return (
    <div
      aria-label="Observatory activity strip"
      className="studio-scrollable"
      style={{ display: 'flex', gap: 8, minWidth: 0, overflow: 'auto', padding: 10, borderTop: `1px solid ${faintLine}` }}
    >
      {props.signals.length === 0 ? (
        <span style={{ color: muted }}>No recent activity.</span>
      ) : props.signals.slice(0, 14).map((signal) => (
        <button
          key={signal.id}
          type="button"
          onClick={() => props.onSelect(signal.id)}
          style={{
            flex: '0 0 230px',
            display: 'grid',
            gap: 5,
            minWidth: 0,
            border: `1px solid ${signal.id === props.selectedSignalId ? severityColor(signal.severity) : faintLine}`,
            borderTop: `2px solid ${severityColor(signal.severity)}`,
            background: 'rgba(0,0,0,0.2)',
            color: ink,
            cursor: 'pointer',
            font: 'inherit',
            textAlign: 'left',
            padding: 8
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signal.label}</span>
          <span style={{ color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signal.summary}</span>
        </button>
      ))}
    </div>
  );
}

export function ObservatorySpaceView() {
  const project = useProjectSessionStore((state) => state.project);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const report = useDiagnosticsStore((state) => state.report);
  const logs = useDiagnosticsStore((state) => state.logs);
  const jobs = useJobsStore((state) => state.jobs);
  const [selectedSignalId, setSelectedSignalId] = useState<string>();
  const [selectedFieldId, setSelectedFieldId] = useState<string>();
  const [fieldOverlayModeOverride, setFieldOverlayModeOverride] = useState<BehaviouralFieldOverlayMode>();
  const [runtimeProfileKind, setRuntimeProfileKind] = useState<RuntimePerformanceProfileKind>('studio');
  const runtimeProfile = useMemo(() => resolveRuntimeProfile(project, runtimeProfileKind), [project, runtimeProfileKind]);
  const snapshot = useMemo(
    () => deriveObservatorySnapshot({
      project,
      dirty,
      diagnostics: report,
      logs,
      jobs,
      selectedSignalId,
      runtimeProfileKind
    }),
    [project, dirty, report, logs, jobs, selectedSignalId, runtimeProfileKind]
  );
  const selectedSignal = snapshot.selectedSignal;
  const availableFieldIds = snapshot.fieldRuntime.reports.map((report) => report.fieldId);
  const availableSignalIds = snapshot.signals.map((signal) => signal.id);
  const selectedSignalFieldId = fieldIdFromSpatialSignalId(selectedSignal.id);
  const effectiveSelectedFieldId = selectedFieldId && availableFieldIds.includes(selectedFieldId)
    ? selectedFieldId
    : selectedSignalFieldId && availableFieldIds.includes(selectedSignalFieldId)
      ? selectedSignalFieldId
      : availableFieldIds[0];
  const selectedField = snapshot.fieldRuntime.reports.find((report) => report.fieldId === effectiveSelectedFieldId);
  const fieldOverlayMode = resolveFieldOverlayMode({
    explicitMode: fieldOverlayModeOverride,
    selectedField,
    fieldCopy: effectiveSelectedFieldId ? snapshot.fieldLanguage[effectiveSelectedFieldId] : undefined
  });
  const handleSelectSignal = (signalId: string) => {
    setSelectedSignalId(signalId);
    setSelectedFieldId((currentFieldId) => resolveNextFieldSelectionFromSignal(signalId, currentFieldId, availableFieldIds));
  };
  const handleSelectField = (fieldId: string) => {
    setSelectedFieldId(fieldId);

    const nextSignalId = resolveNextSignalSelectionFromField(fieldId, availableSignalIds);
    if (nextSignalId) {
      setSelectedSignalId(nextSignalId);
    }
  };
  const activitySignals = snapshot.signals.filter((signal) =>
    signal.laneId === 'activity'
    || signal.laneId === 'render-graph'
    || signal.severity === 'blocked'
    || signal.severity === 'warning'
  );

  return (
    <div
      aria-label="Observatory Space"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) 118px',
        gap: 0,
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        background: 'rgba(6,8,10,0.92)'
      }}
    >
      <header style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        gap: 16,
        alignItems: 'end',
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${line}`,
        background: 'linear-gradient(90deg, rgba(18,23,24,0.96), rgba(19,18,14,0.95))'
      }}>
        <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
          <span style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0 }}>Observatory Space</span>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.02, fontWeight: 500, overflowWrap: 'anywhere' }}>{snapshot.compositionName}</h1>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: muted }}>
            <span>{snapshot.sequence?.name ?? 'No sequence'} / {snapshot.variant?.name ?? 'No variant'}</span>
            <span>{snapshot.dirty ? 'unsaved' : 'saved'}</span>
            <span>{snapshot.resolverOk ? 'composition resolved' : 'resolver fallback'}</span>
          </div>
        </div>
        <ProfileSelector
          selectedKind={runtimeProfileKind}
          profiles={project.runtimeProfiles}
          onChange={setRuntimeProfileKind}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={pillStyle(snapshot.trust.state === 'trusted' ? 'success' : 'warn')}>{snapshot.trust.state}</span>
          <span style={pillStyle(snapshot.trust.blockerCount > 0 ? 'warn' : 'default')}>{snapshot.trust.blockerCount} blockers</span>
          <span style={pillStyle(snapshot.trust.warningCount > 0 ? 'warn' : 'default')}>{snapshot.trust.warningCount} warnings</span>
        </div>
      </header>

      <main style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gridAutoRows: 'minmax(420px, 1fr)',
        gap: 10,
        minHeight: 0,
        minWidth: 0,
        padding: 10,
        overflow: 'auto'
      }}>
        <Section title="Telemetry and Trust" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10, padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Metric label="pressure" value={formatPercent(snapshot.telemetry.pressure)} />
            <Metric label="entropy" value={formatPercent(snapshot.telemetry.entropy)} />
            <Metric label="cohesion" value={formatPercent(snapshot.telemetry.cohesion)} />
            <Metric label="memory" value={formatPercent(snapshot.telemetry.memory)} />
            <Metric label="routes" value={snapshot.telemetry.routeCount} />
            <Metric label="capture" value={snapshot.telemetry.captureEventCount} />
            <Metric label="fields" value={snapshot.telemetry.spatialFieldCount} />
            <Metric label="field diag" value={snapshot.telemetry.fieldRuntimeDiagnosticCount} tone={snapshot.telemetry.fieldRuntimeDiagnosticCount > 0 ? 'warning' : 'healthy'} />
          </div>
          <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 12, minHeight: 0, overflow: 'auto' }}>
            {snapshot.lanes.filter((lane) => lane.id === 'world-state' || lane.id === 'trust').map((lane) => (
              <LaneSummary key={lane.id} lane={lane} selectedSignalId={selectedSignal.id} onSelect={handleSelectSignal} />
            ))}
          </div>
        </Section>

        <Section title="Behaviour Map" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(260px, 1fr) 250px', minHeight: 0 }}>
          <SignalMap signals={snapshot.signals} selectedSignalId={selectedSignal.id} onSelect={handleSelectSignal} />
          <FieldRuntimeInspector
            reports={snapshot.fieldRuntime.reports}
            fieldLanguage={snapshot.fieldLanguage}
            runtimeProfile={runtimeProfile}
            selectedFieldId={effectiveSelectedFieldId}
            overlayMode={fieldOverlayMode}
            onSelectField={handleSelectField}
            onOverlayModeChange={setFieldOverlayModeOverride}
          />
        </Section>

        <Section title="Signal Detail" bodyStyle={{ minHeight: 0 }}>
          <DetailDrawer signal={selectedSignal} />
        </Section>
      </main>

      <footer style={{ minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', borderTop: `1px solid ${line}` }}>
        <EventStrip signals={activitySignals} selectedSignalId={selectedSignal.id} onSelect={handleSelectSignal} />
        <div style={{ minWidth: 0, borderLeft: `1px solid ${faintLine}`, padding: 10, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>Raw logs</strong>
            <span style={{ color: muted }}>{logs.length}</span>
          </div>
          <details style={{ minHeight: 0 }}>
            <summary style={{ color: muted, cursor: 'pointer' }}>Open application log</summary>
            <div className="studio-scrollable" style={{ display: 'grid', gap: 6, maxHeight: 72, overflow: 'auto', marginTop: 8 }}>
              {logs.length === 0 ? <span style={{ color: muted }}>No log entries yet.</span> : logs.slice(-5).reverse().map((entry) => (
                <div key={entry.id} style={{ display: 'grid', gap: 3, color: muted }}>
                  <span>{entry.level} / {entry.message}</span>
                  {entry.details ? <span>{entry.details}</span> : null}
                </div>
              ))}
            </div>
          </details>
        </div>
      </footer>
    </div>
  );
}
