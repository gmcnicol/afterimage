import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type {
  ArchiveBehaviourSeed,
  ArchiveMetadataFile,
  ArchiveMotifCandidate,
  ArchiveRecurrenceLink,
  ArchiveReferenceKind,
  ArchiveSegment,
  ArchiveWeightedTag,
  ArchiveWorldAffinityCandidate,
  NormalizedArchiveMetadataFile
} from '@afterimage/project-model';
import type { ArchiveDiagnostic, ArchiveSidecarListResult, ArchiveSidecarLoadResult } from '../../lib/studio-client';
import { ToolbarButton } from '../../app/components/ToolbarButton';
import { accent, muted, pillStyle } from '../../app/styles';
import { getPathBasename, formatMillisecondsDetail, formatPathTail } from '../view-support';
import { getStudioClient } from '../../lib/studio-client';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import {
  buildArchiveTargetOptions,
  classifyArchiveCandidateState,
  getArchiveCandidateStateLabel,
  type ArchiveCandidateState
} from './helpers';

type CandidateSelection = {
  kind: ArchiveReferenceKind;
  id: string;
};

type ArchiveCandidateCard = CandidateSelection & {
  group: string;
  label: string;
  subline: string;
  body?: string;
  descriptors: string[];
  confidence?: number;
  weight?: number;
};

const shellStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '300px minmax(0, 1fr) 360px',
  height: '100%',
  minHeight: 0,
  minWidth: 0,
  background: 'linear-gradient(180deg, rgba(11, 14, 19, 0.98), rgba(8, 10, 14, 0.98))'
};

const zoneStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)'
};

const sectionHeaderStyle: CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  display: 'grid',
  gap: 8
};

const eyebrowStyle: CSSProperties = {
  color: 'rgba(246,247,249,0.58)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 600
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.15,
  fontWeight: 500
};

const cardStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.035)',
  padding: 10,
  display: 'grid',
  gap: 8,
  minWidth: 0
};

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(5,7,10,0.72)',
  color: '#f6f7f9',
  height: 28,
  padding: '0 8px',
  font: 'inherit'
};

function formatPercent(value?: number): string | undefined {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : undefined;
}

function stateTone(state: ArchiveCandidateState): 'default' | 'success' | 'warn' {
  if (state === 'accepted') {
    return 'success';
  }
  if (state === 'rejected') {
    return 'warn';
  }
  return 'default';
}

function candidateBorder(state: ArchiveCandidateState, selected: boolean): string {
  if (selected) {
    return `1px solid ${accent}`;
  }
  if (state === 'accepted') {
    return '1px solid rgba(103,177,145,0.38)';
  }
  if (state === 'rejected') {
    return '1px solid rgba(166,144,210,0.38)';
  }
  return '1px solid rgba(255,255,255,0.08)';
}

function getErrorDetails(sidecar: ArchiveSidecarLoadResult): string[] {
  return sidecar.error?.details?.length ? sidecar.error.details : sidecar.error ? [sidecar.error.message] : [];
}

function getCandidateCards(archive: NormalizedArchiveMetadataFile): ArchiveCandidateCard[] {
  const weighted = (group: string, kind: ArchiveReferenceKind, item: ArchiveWeightedTag): ArchiveCandidateCard => ({
    group,
    kind,
    id: item.id,
    label: item.label,
    subline: item.segmentIds?.length ? `${item.segmentIds.length} linked segment${item.segmentIds.length === 1 ? '' : 's'}` : 'No segment link',
    descriptors: item.descriptors ?? [],
    confidence: item.confidence,
    weight: item.intensity
  });

  return [
    ...archive.segments.map((segment): ArchiveCandidateCard => ({
      group: 'Segments',
      kind: 'segment',
      id: segment.id,
      label: segment.label ?? segment.id,
      subline: formatMillisecondsDetail(segment.range.endMs - segment.range.startMs),
      descriptors: segment.tags ?? [],
      confidence: segment.confidence
    })),
    ...archive.motifs.map((motif): ArchiveCandidateCard => ({
      group: 'Motifs',
      kind: 'motif',
      id: motif.id,
      label: motif.label,
      subline: motif.recurrenceGroupId ?? `${motif.segmentIds?.length ?? 0} segment links`,
      descriptors: motif.descriptors ?? [],
      confidence: motif.confidence,
      weight: motif.weight
    })),
    ...archive.atmospheres.map((item) => weighted('Atmospheres', 'atmosphere', item)),
    ...archive.materials.map((item) => weighted('Materials', 'material', item)),
    ...archive.motion.map((item) => weighted('Motion', 'motion', item)),
    ...archive.behaviourSeeds.map((seed): ArchiveCandidateCard => ({
      group: 'Behaviour Seeds',
      kind: 'behaviour-seed',
      id: seed.id,
      label: seed.type,
      subline: typeof seed.seed === 'number' ? `Seed ${seed.seed}` : 'Generated behaviour',
      descriptors: [
        ...(seed.segmentIds ?? []),
        ...(seed.motifIds ?? []),
        ...(seed.atmosphereIds ?? [])
      ],
      confidence: seed.confidence,
      weight: seed.strength
    })),
    ...archive.recurrence.map((link): ArchiveCandidateCard => ({
      group: 'Recurrence',
      kind: 'recurrence',
      id: link.id,
      label: link.relationship,
      subline: `${link.sourceId} -> ${link.targetId}`,
      body: link.explanation,
      descriptors: [],
      weight: link.strength
    })),
    ...archive.affinity.map((candidate): ArchiveCandidateCard => ({
      group: 'Affinity',
      kind: 'affinity',
      id: candidate.id,
      label: candidate.label ?? candidate.id,
      subline: `${candidate.sourceId} -> ${candidate.targetId}`,
      descriptors: candidate.descriptors ?? [],
      confidence: candidate.confidence,
      weight: candidate.weight
    }))
  ];
}

function getCandidateDetail(archive: NormalizedArchiveMetadataFile, selection?: CandidateSelection):
  | ArchiveSegment
  | ArchiveMotifCandidate
  | ArchiveWeightedTag
  | ArchiveBehaviourSeed
  | ArchiveRecurrenceLink
  | ArchiveWorldAffinityCandidate
  | undefined {
  if (!selection) {
    return undefined;
  }
  switch (selection.kind) {
    case 'segment':
      return archive.segments.find((candidate) => candidate.id === selection.id);
    case 'motif':
      return archive.motifs.find((candidate) => candidate.id === selection.id);
    case 'atmosphere':
      return archive.atmospheres.find((candidate) => candidate.id === selection.id);
    case 'material':
      return archive.materials.find((candidate) => candidate.id === selection.id);
    case 'motion':
      return archive.motion.find((candidate) => candidate.id === selection.id);
    case 'behaviour-seed':
      return archive.behaviourSeeds.find((candidate) => candidate.id === selection.id);
    case 'recurrence':
      return archive.recurrence.find((candidate) => candidate.id === selection.id);
    case 'affinity':
      return archive.affinity.find((candidate) => candidate.id === selection.id);
  }
}

function diagnosticLabel(diagnostic: ArchiveDiagnostic): string {
  return `${diagnostic.code}: ${diagnostic.message}`;
}

export function ArchiveSpaceView() {
  const api = getStudioClient();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const acceptArchiveCandidate = useProjectSessionStore((state) => state.acceptArchiveCandidate);
  const rejectArchiveCandidate = useProjectSessionStore((state) => state.rejectArchiveCandidate);
  const addNotification = useUiStore((state) => state.addNotification);
  const [archiveResult, setArchiveResult] = useState<ArchiveSidecarListResult>({ sidecars: [], diagnostics: [] });
  const [loading, setLoading] = useState(false);
  const [selectedSidecarPath, setSelectedSidecarPath] = useState<string>();
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSelection>();
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [note, setNote] = useState('');

  const loadedSidecars = archiveResult.sidecars.filter((sidecar) => sidecar.archive);
  const invalidSidecars = archiveResult.sidecars.filter((sidecar) => sidecar.error);
  const selectedSidecar = archiveResult.sidecars.find((sidecar) => sidecar.path === selectedSidecarPath)
    ?? loadedSidecars[0]
    ?? archiveResult.sidecars[0];
  const archive = selectedSidecar?.archive;
  const sourceAsset = archive ? project.assets.find((asset) => asset.id === archive.sourceAssetId) : undefined;
  const candidateCards = useMemo(() => archive ? getCandidateCards(archive) : [], [archive]);
  const selectedCard = candidateCards.find((candidate) => candidate.kind === selectedCandidate?.kind && candidate.id === selectedCandidate.id) ?? candidateCards[0];
  const selectedDetail = archive ? getCandidateDetail(archive, selectedCard) : undefined;
  const targetOptions = useMemo(() => buildArchiveTargetOptions(project), [project]);
  const selectedTarget = targetOptions.find((target) => target.id === selectedTargetId) ?? targetOptions[0];
  const selectedState = archive && selectedCard
    ? classifyArchiveCandidateState(project, {
        archiveId: archive.id,
        referenceKind: selectedCard.kind,
        candidateId: selectedCard.id,
        targetIds: selectedTarget?.targetIds
      })
    : 'candidate';
  const missingSidecarDiagnostics = archiveResult.diagnostics.filter((diagnostic) => diagnostic.code === 'missing-sidecar');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.project.listArchiveSidecars({ projectRoot, project }).then((result) => {
      if (!active) {
        return;
      }
      setArchiveResult(result);
      setSelectedSidecarPath((current) => result.sidecars.some((sidecar) => sidecar.path === current)
        ? current
        : result.sidecars[0]?.path);
    }).catch((error: unknown) => {
      if (active) {
        addNotification(`Archive sidecars failed: ${error instanceof Error ? error.message : String(error)}`, 'warn', 5200);
      }
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [api.project, addNotification, project, projectRoot]);

  useEffect(() => {
    setSelectedCandidate((current) => candidateCards.some((candidate) => candidate.kind === current?.kind && candidate.id === current.id)
      ? current
      : candidateCards[0] ? { kind: candidateCards[0].kind, id: candidateCards[0].id } : undefined);
  }, [candidateCards]);

  useEffect(() => {
    setSelectedTargetId((current) => targetOptions.some((target) => target.id === current)
      ? current
      : targetOptions[0]?.id);
  }, [targetOptions]);

  const reloadSidecars = async () => {
    const result = await api.project.listArchiveSidecars({ projectRoot, project });
    setArchiveResult(result);
    setSelectedSidecarPath((current) => result.sidecars.some((sidecar) => sidecar.path === current)
      ? current
      : result.sidecars[0]?.path);
  };

  const importSidecar = async () => {
    if (!projectRoot) {
      addNotification('Save or open a project before importing archive sidecars.', 'warn');
      return;
    }
    try {
      const result = await api.project.importArchiveSidecars({ projectRoot });
      await reloadSidecars();
      if (result.rejected.length > 0) {
        addNotification(`${result.rejected.length} archive sidecar${result.rejected.length === 1 ? '' : 's'} failed validation.`, 'warn', 5200);
        return;
      }
      addNotification(`Imported ${result.importedPaths.length} archive sidecar${result.importedPaths.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      addNotification(`Archive import failed: ${error instanceof Error ? error.message : String(error)}`, 'warn', 5200);
    }
  };

  const applyCandidateAction = (action: 'accept' | 'reject') => {
    if (!archive || !selectedCard || !selectedTarget) {
      return;
    }
    const input = {
      archive: archive as ArchiveMetadataFile,
      referenceKind: selectedCard.kind,
      candidateId: selectedCard.id,
      scope: selectedTarget.scope,
      targetIds: selectedTarget.targetIds,
      note: note.trim() || undefined
    };
    if (action === 'accept') {
      acceptArchiveCandidate(input);
      addNotification(`Accepted ${selectedCard.label} into ${selectedTarget.label}.`, 'success');
      return;
    }
    rejectArchiveCandidate(input);
    addNotification(`Rejected ${selectedCard.label} for ${selectedTarget.label}.`, 'warn');
  };

  const saveProject = () => {
    void api.project.saveProject({ project, projectFilePath }).then(setSession);
  };

  const openProject = () => {
    void api.project.openProject().then((session) => session && setSession(session));
  };

  return (
    <div style={shellStyle} aria-label="Archive memory reservoir">
      <aside style={zoneStyle}>
        <div style={sectionHeaderStyle}>
          <div style={eyebrowStyle}>Memory Index</div>
          <h2 style={titleStyle}>Archive sidecars</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ToolbarButton primary onClick={() => void importSidecar()} disabled={!projectRoot} title={projectRoot ? 'Import Archive Sidecar' : 'Save or open a project first'}>Import Archive Sidecar</ToolbarButton>
            <ToolbarButton onClick={() => void reloadSidecars()} disabled={loading}>Refresh</ToolbarButton>
          </div>
        </div>
        <div className="studio-scrollable" style={{ padding: 12, display: 'grid', alignContent: 'start', gap: 10 }}>
          {!projectRoot ? (
            <div style={{ ...cardStyle, gap: 10 }}>
              <div style={{ color: '#f6f7f9', fontWeight: 500 }}>Project root required</div>
              <div style={{ color: muted, lineHeight: 1.45 }}>Archive sidecars attach to a saved project folder.</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <ToolbarButton primary onClick={saveProject}>Save Project</ToolbarButton>
                <ToolbarButton onClick={openProject}>Open Project</ToolbarButton>
              </div>
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            <div style={pillStyle('success')}>{loadedSidecars.length} loaded</div>
            <div style={pillStyle(invalidSidecars.length > 0 ? 'warn' : 'default')}>{invalidSidecars.length} invalid</div>
            <div style={pillStyle(missingSidecarDiagnostics.length > 0 ? 'warn' : 'default')}>{missingSidecarDiagnostics.length} missing</div>
          </div>
          {archiveResult.sidecars.length === 0 && projectRoot ? (
            <div style={{ ...cardStyle, color: muted, lineHeight: 1.45 }}>No archive sidecars found in .afterimage/archive, archive, or archives.</div>
          ) : null}
          {archiveResult.sidecars.map((sidecar) => {
            const isSelected = sidecar.path === selectedSidecar?.path;
            const counts = sidecar.archive ? [
              sidecar.archive.segments.length,
              sidecar.archive.motifs.length,
              sidecar.archive.atmospheres.length,
              sidecar.archive.recurrence.length,
              sidecar.archive.affinity.length
            ].reduce((sum, value) => sum + value, 0) : 0;
            return (
              <button
                key={sidecar.path}
                type="button"
                onClick={() => setSelectedSidecarPath(sidecar.path)}
                style={{
                  ...cardStyle,
                  textAlign: 'left',
                  color: '#f6f7f9',
                  cursor: 'pointer',
                  border: isSelected ? `1px solid ${accent}` : sidecar.error ? '1px solid rgba(166,144,210,0.38)' : cardStyle.border
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sidecar.archive?.id ?? getPathBasename(sidecar.path)}
                  </span>
                  <span style={pillStyle(sidecar.error ? 'warn' : sidecar.diagnostics.length > 0 ? 'warn' : 'success')}>
                    {sidecar.error ? 'Invalid' : sidecar.diagnostics.length > 0 ? 'Check' : 'Ready'}
                  </span>
                </div>
                <div style={{ color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatPathTail(sidecar.path)}</div>
                {sidecar.archive ? (
                  <div style={{ color: muted }}>{counts} memories · {sidecar.archive.sourceAssetId}</div>
                ) : (
                  <div style={{ color: '#ccbdf0' }}>{sidecar.error?.message}</div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <main style={{ ...zoneStyle, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={sectionHeaderStyle}>
          <div style={eyebrowStyle}>Archive Archaeology Surface</div>
          <h2 style={titleStyle}>{archive?.id ?? 'Memory reservoir'}</h2>
          {archive ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={pillStyle(sourceAsset ? 'success' : 'warn')}>{sourceAsset?.label ?? sourceAsset?.filename ?? archive.sourceAssetId}</span>
              <span style={pillStyle('default')}>{archive.sourceSystem}</span>
              <span style={pillStyle('default')}>{archive.generatedAt ?? 'undated'}</span>
            </div>
          ) : null}
        </div>
        <div className="studio-scrollable" style={{ padding: 14, display: 'grid', alignContent: 'start', gap: 14 }}>
          {!archive ? (
            <div style={{ ...cardStyle, color: muted }}>Select or import a valid archive sidecar to inspect memory candidates.</div>
          ) : null}
          {archive ? (
            <>
              <section style={{ display: 'grid', gap: 8 }}>
                <div style={{ ...eyebrowStyle, color: '#f6f7f9' }}>Segment timeline</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {archive.segments.map((segment) => {
                    const state = classifyArchiveCandidateState(project, {
                      archiveId: archive.id,
                      referenceKind: 'segment',
                      candidateId: segment.id
                    });
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => setSelectedCandidate({ kind: 'segment', id: segment.id })}
                        style={{
                          ...cardStyle,
                          gridTemplateColumns: '120px minmax(0, 1fr) auto',
                          alignItems: 'center',
                          textAlign: 'left',
                          color: '#f6f7f9',
                          cursor: 'pointer',
                          border: candidateBorder(state, selectedCard?.kind === 'segment' && selectedCard.id === segment.id)
                        }}
                      >
                        <span style={{ color: muted }}>{formatMillisecondsDetail(segment.range.startMs)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{segment.label ?? segment.id}</span>
                        <span style={pillStyle(stateTone(state))}>{getArchiveCandidateStateLabel(state)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section style={{ display: 'grid', gap: 10 }}>
                <div style={{ ...eyebrowStyle, color: '#f6f7f9' }}>Motifs, atmospheres, material, motion, recurrence, affinity</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {candidateCards.map((candidate) => {
                    const state = classifyArchiveCandidateState(project, {
                      archiveId: archive.id,
                      referenceKind: candidate.kind,
                      candidateId: candidate.id
                    });
                    const isSelected = selectedCard?.kind === candidate.kind && selectedCard.id === candidate.id;
                    return (
                      <button
                        key={`${candidate.kind}:${candidate.id}`}
                        type="button"
                        onClick={() => setSelectedCandidate({ kind: candidate.kind, id: candidate.id })}
                        style={{
                          ...cardStyle,
                          textAlign: 'left',
                          color: '#f6f7f9',
                          cursor: 'pointer',
                          minHeight: 112,
                          alignContent: 'start',
                          border: candidateBorder(state, isSelected)
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ color: muted }}>{candidate.group}</span>
                          <span style={pillStyle(stateTone(state))}>{getArchiveCandidateStateLabel(state)}</span>
                        </div>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.label}</div>
                        <div style={{ color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.subline}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {formatPercent(candidate.confidence) ? <span style={pillStyle('default')}>conf {formatPercent(candidate.confidence)}</span> : null}
                          {formatPercent(candidate.weight) ? <span style={pillStyle('default')}>weight {formatPercent(candidate.weight)}</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>

      <aside style={{ ...zoneStyle, borderRight: 0 }}>
        <div style={sectionHeaderStyle}>
          <div style={eyebrowStyle}>Provenance / Acceptance Inspector</div>
          <h2 style={titleStyle}>{selectedCard?.label ?? (selectedSidecar ? 'Sidecar diagnostics' : 'No selection')}</h2>
          {archive && selectedCard ? <span style={pillStyle(stateTone(selectedState))}>{getArchiveCandidateStateLabel(selectedState)}</span> : null}
        </div>
        <div className="studio-scrollable" style={{ padding: 14, display: 'grid', alignContent: 'start', gap: 12 }}>
          {selectedSidecar?.error ? (
            <section style={cardStyle}>
              <div style={{ fontWeight: 500, color: '#ccbdf0' }}>Validation failure</div>
              {getErrorDetails(selectedSidecar).map((detail) => (
                <div key={detail} style={{ color: muted, lineHeight: 1.45 }}>{detail}</div>
              ))}
            </section>
          ) : null}

          {archive ? (
            <>
              <section style={cardStyle}>
                <div style={{ fontWeight: 500 }}>Provenance</div>
                <div style={{ color: muted }}>Generator: {archive.provenance.generator ?? 'unknown'} {archive.provenance.generatorVersion ?? ''}</div>
                <div style={{ color: muted }}>Source URI: {archive.provenance.sourceUri ?? 'unresolved'}</div>
                <div style={{ color: muted }}>Rights: {archive.provenance.rightsStatus ?? 'missing'} / {archive.provenance.license ?? 'missing license'}</div>
                <div style={{ color: muted }}>Source asset: {sourceAsset ? `${sourceAsset.label ?? sourceAsset.filename} (${sourceAsset.id})` : archive.sourceAssetId}</div>
              </section>

              {selectedCard ? (
                <section style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{selectedCard.label}</div>
                      <div style={{ color: muted }}>{selectedCard.kind} · {selectedCard.id}</div>
                    </div>
                    <span style={pillStyle(stateTone(selectedState))}>{getArchiveCandidateStateLabel(selectedState)}</span>
                  </div>
                  {selectedCard.body ? <div style={{ color: muted, lineHeight: 1.45 }}>{selectedCard.body}</div> : null}
                  {selectedCard.descriptors.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {selectedCard.descriptors.slice(0, 8).map((descriptor) => <span key={descriptor} style={pillStyle('default')}>{descriptor}</span>)}
                    </div>
                  ) : null}
                  {selectedDetail ? (
                    <pre style={{
                      margin: 0,
                      maxHeight: 180,
                      overflow: 'auto',
                      color: muted,
                      background: 'rgba(5,7,10,0.45)',
                      padding: 8,
                      fontSize: 11,
                      lineHeight: 1.35
                    }}>{JSON.stringify(selectedDetail, null, 2)}</pre>
                  ) : null}
                </section>
              ) : null}

              <section style={cardStyle}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={eyebrowStyle}>Target</span>
                  <select value={selectedTarget?.id ?? ''} onChange={(event) => setSelectedTargetId(event.target.value)} style={inputStyle}>
                    {targetOptions.map((target) => (
                      <option key={target.id} value={target.id}>{target.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={eyebrowStyle}>Note</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} style={inputStyle} placeholder="Optional archive note" />
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <ToolbarButton primary onClick={() => applyCandidateAction('accept')} disabled={!selectedCard}>Accept</ToolbarButton>
                  <ToolbarButton onClick={() => applyCandidateAction('reject')} disabled={!selectedCard}>Reject</ToolbarButton>
                </div>
              </section>

              <section style={cardStyle}>
                <div style={{ fontWeight: 500 }}>Diagnostics</div>
                {archiveResult.diagnostics.length === 0 && (selectedSidecar?.diagnostics.length ?? 0) === 0 ? (
                  <div style={{ color: muted }}>No archive diagnostics.</div>
                ) : null}
                {[...(selectedSidecar?.diagnostics ?? []), ...archiveResult.diagnostics.filter((diagnostic) => !diagnostic.path.startsWith(`archives.${archive.id}.`))].map((diagnostic) => (
                  <div key={`${diagnostic.path}:${diagnostic.message}`} style={{ color: diagnostic.severity === 'export-blocker' ? '#ccbdf0' : muted, lineHeight: 1.45 }}>
                    {diagnosticLabel(diagnostic)}
                  </div>
                ))}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
