import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState, startTransition, type CSSProperties, type PropsWithChildren } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { exportProfiles, type ExportProfileId } from '@afterimage/export-profiles';
import { loadPresetLibrary } from '@afterimage/preset-library';
import { getDefaultVariant } from '@afterimage/project-model';
import { Panel, Screen } from '@afterimage/ui';
import { getDesktopApi, type DesktopJob } from '../lib/desktop-api';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import { useUiStore, type StudioTab } from '../stores/ui-store';

const tabs: Array<{ id: StudioTab; label: string }> = [
  { id: 'project', label: 'Project' },
  { id: 'media', label: 'Media' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'cuts', label: 'Cuts' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'music', label: 'Music' },
  { id: 'style', label: 'Style' },
  { id: 'automation', label: 'Automation' },
  { id: 'export', label: 'Export' },
  { id: 'diagnostics', label: 'Diagnostics' }
];

const accent = '#f48762';
const muted = '#a6adbb';

function getEnabledExportProfileIds(profileIds: Array<{ enabled?: boolean; profileId: string }>): ExportProfileId[] {
  return profileIds
    .filter((selection) => selection.enabled)
    .map((selection) => selection.profileId as ExportProfileId);
}

function buttonStyle(primary = false): CSSProperties {
  return {
    border: primary ? '1px solid #ff9f7f' : '1px solid #41495b',
    background: primary ? 'linear-gradient(135deg, #ff9f7f, #f48762)' : 'rgba(22, 25, 34, 0.92)',
    color: primary ? '#130f12' : '#f6f7f9',
    borderRadius: 999,
    padding: '9px 14px',
    fontWeight: 700,
    cursor: 'pointer'
  };
}

function pillStyle(tone: 'default' | 'success' | 'warn' = 'default'): CSSProperties {
  const map = {
    default: { background: 'rgba(255,255,255,0.08)', color: '#f5f6f8' },
    success: { background: 'rgba(67, 201, 142, 0.15)', color: '#86f2be' },
    warn: { background: 'rgba(255, 187, 92, 0.15)', color: '#ffd18a' }
  };

  return {
    ...map[tone],
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700
  };
}

function toMediaSrc(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  return path.startsWith('/') ? `file://${path}` : path;
}

function useDesktopBootstrap(): void {
  const api = getDesktopApi();
  const setSession = useProjectSessionStore((state) => state.setSession);
  const setJobs = useJobsStore((state) => state.setJobs);
  const upsertJobs = useJobsStore((state) => state.upsertJobs);
  const setReport = useDiagnosticsStore((state) => state.setReport);
  const setLogs = useDiagnosticsStore((state) => state.setLogs);
  const setProject = useProjectSessionStore((state) => state.setProject);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);

  const applyJobEffects = useEffectEvent((jobs: DesktopJob[]) => {
    upsertJobs(jobs);
    for (const job of jobs) {
      if (job.status === 'completed' && job.result?.project) {
        setProject(job.result.project);
      }
      if (job.status === 'completed' && job.result?.kind === 'preview' && job.result.outputPath) {
        setPreviewPath(job.result.outputPath);
      }
    }
  });

  const refreshDiagnostics = useEffectEvent(async () => {
    const [report, logs] = await Promise.all([
      api.diagnostics.getReport(),
      api.diagnostics.getLogs()
    ]);
    setReport(report);
    setLogs(logs);
  });

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const [session, jobs, report, logs] = await Promise.all([
        api.project.getInitialState(),
        api.jobs.list(),
        api.diagnostics.getReport(),
        api.diagnostics.getLogs()
      ]);

      if (!isActive) {
        return;
      }

      const currentSession = useProjectSessionStore.getState();
      const shouldApplySession = !currentSession.dirty
        && currentSession.project.assets.length === 0
        && !currentSession.projectFilePath;

      if (shouldApplySession) {
        setSession(session);
      }
      setJobs(jobs);
      setReport(report);
      setLogs(logs);
    })();

    const unsubscribe = api.jobs.subscribe((jobs) => {
      if (isActive) {
        applyJobEffects(jobs);
        void refreshDiagnostics();
      }
    });

    const intervalId = window.setInterval(() => {
      if (isActive) {
        void refreshDiagnostics();
      }
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [api, applyJobEffects, refreshDiagnostics, setJobs, setLogs, setReport, setSession]);
}

function useKeyboardShortcuts(): void {
  const api = getDesktopApi();
  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const selectedCutId = useUiStore((state) => state.selectedCutId);
  const selectedFilterId = useUiStore((state) => state.selectedFilterId);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const updateCutFavorite = useProjectSessionStore((state) => state.toggleCutFavorite);
  const addCutToSequence = useProjectSessionStore((state) => state.addCutToSequence);
  const safeRandomizeFilter = useProjectSessionStore((state) => state.safeRandomizeFilter);
  const safeRandomizeStack = useProjectSessionStore((state) => state.safeRandomizeStack);
  const save = useEffectEvent(async () => {
    const session = await api.project.saveProject({
      project,
      projectFilePath
    });
    useProjectSessionStore.getState().setSession(session);
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;

      if (isMeta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }

      if (isMeta && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void api.project.openProject().then((session) => {
          if (session) {
            useProjectSessionStore.getState().setSession(session);
          }
        });
      }

      if (isMeta && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void api.project.createProject().then((session) => {
          if (session) {
            useProjectSessionStore.getState().setSession(session);
          }
        });
      }

      if (event.key.toLowerCase() === 'a' && selectedCutId) {
        event.preventDefault();
        addCutToSequence(selectedCutId);
      }

      if (event.key.toLowerCase() === 'f' && selectedCutId) {
        event.preventDefault();
        updateCutFavorite(selectedCutId);
      }

      if (event.key.toLowerCase() === 'r' && selectedFilterId) {
        event.preventDefault();
        const stackId = project.variants.find((variant) => variant.id === (selectedVariantId ?? getDefaultVariant(project)?.id))?.stackId;
        if (stackId) {
          safeRandomizeFilter(stackId, selectedFilterId);
        }
      }

      if (event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        const stackId = project.variants.find((variant) => variant.id === (selectedVariantId ?? getDefaultVariant(project)?.id))?.stackId;
        if (stackId) {
          safeRandomizeStack(stackId);
        }
      }

      if (isMeta && event.key === 'Enter') {
        event.preventDefault();
        void api.jobs.runExport({
          project,
          projectRoot: projectRoot ?? '.',
          outputPath: `${projectRoot ?? '.'}/exports/${project.id}`,
          profileIds: getEnabledExportProfileIds(project.exportSelections),
          selections: project.exportSelections
        });
        setCurrentTab('export');
      }

      if (event.key === ' ') {
        event.preventDefault();
        startTransition(() => {
          setCurrentTab(currentTab === 'sequence' ? 'cuts' : 'sequence');
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [addCutToSequence, api.jobs, api.project, currentTab, project, projectFilePath, projectRoot, safeRandomizeFilter, safeRandomizeStack, save, selectedCutId, selectedFilterId, selectedVariantId, setCurrentTab, updateCutFavorite]);
}

function ToolbarButton(props: PropsWithChildren<{ primary?: boolean; onClick?: () => void }>) {
  return (
    <button type="button" onClick={props.onClick} style={buttonStyle(props.primary)}>
      {props.children}
    </button>
  );
}

function VirtualList<T>({
  items,
  estimateSize,
  renderItem
}: {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    overscan: 6
  });

  return (
    <div
      ref={setScrollElement}
      style={{
        height: 420,
        overflow: 'auto',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        background: 'rgba(15, 18, 24, 0.88)'
      }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              insetInline: 0,
              transform: `translateY(${virtualItem.start}px)`,
              padding: '8px 10px'
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const recentProjects = useProjectSessionStore((state) => state.recentProjects);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setSession = useProjectSessionStore((state) => state.setSession);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Project Home">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <ToolbarButton primary onClick={() => void api.project.createProject().then((session) => session && setSession(session))}>New Project</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.openProject().then((session) => session && setSession(session))}>Open Project</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.saveProject({ project, projectFilePath }).then(setSession)}>Save</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.saveProjectAs({ project, projectFilePath }).then((session) => session && setSession(session))}>Save As</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.duplicateProject({ project, projectFilePath }).then((session) => session && setSession(session))}>Duplicate</ToolbarButton>
          <ToolbarButton onClick={() => projectFilePath && void api.project.revealProjectFolder(projectFilePath)}>Reveal Folder</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <StatCard label="Project" value={project.name} />
          <StatCard label="Dirty State" value={dirty ? 'Unsaved changes' : 'Saved'} tone={dirty ? 'warn' : 'success'} />
          <StatCard label="Assets" value={String(project.assets.length)} />
          <StatCard label="Variants" value={String(project.variants.length)} />
        </div>
        <div style={{ marginTop: 18, color: muted, fontSize: 14 }}>
          <div>File: {projectFilePath ?? 'Not saved yet'}</div>
          <div>Root: {projectRoot ?? 'Unknown'}</div>
          <div>Last saved: {project.metadata.updatedAt ?? 'Not saved yet'}</div>
        </div>
      </Panel>

      <Panel title="Recent Projects">
        <div style={{ display: 'grid', gap: 10 }}>
          {recentProjects.map((recentProject) => (
            <button
              key={recentProject}
              type="button"
              onClick={() => void api.project.openProjectAt(recentProject).then(setSession)}
              style={{
                textAlign: 'left',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f6f7f9',
                padding: 14,
                borderRadius: 16
              }}
            >
              {recentProject}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MediaView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const mergeAssets = useProjectSessionStore((state) => state.mergeImportedAssets);
  const selectAsset = useUiStore((state) => state.selectAsset);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const setStatusMessage = useUiStore((state) => state.setStatusMessage);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const assets = useMemo(() => project.assets.filter((asset) =>
    `${asset.filename} ${(asset.tags ?? []).join(' ')}`.toLowerCase().includes(deferredQuery.toLowerCase())
  ), [deferredQuery, project.assets]);

  const importMedia = useEffectEvent(async () => {
    console.info('[studio-desktop] importMedia:open-dialog', { projectRoot });
    const imported = await api.project.importMedia(projectRoot);
    console.info('[studio-desktop] importMedia:result', {
      imported: imported.length,
      assetIds: imported.map((asset) => asset.id)
    });
    if (imported.length === 0) {
      setStatusMessage('Media import cancelled.');
      return;
    }
    mergeAssets(imported);
    console.info('[studio-desktop] importMedia:merged', {
      visibleAssets: useProjectSessionStore.getState().project.assets.length
    });
    setCurrentTab('media');
    setStatusMessage(`Imported ${imported.length} media file${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`);
  });

  const importMusic = useEffectEvent(async () => {
    console.info('[studio-desktop] importMusic:open-dialog', { projectRoot });
    const imported = await api.project.importMusic(projectRoot);
    console.info('[studio-desktop] importMusic:result', {
      imported: imported.length,
      assetIds: imported.map((asset) => asset.id)
    });
    if (imported.length === 0) {
      setStatusMessage('Music import cancelled.');
      return;
    }
    mergeAssets(imported);
    console.info('[studio-desktop] importMusic:merged', {
      visibleAssets: useProjectSessionStore.getState().project.assets.length
    });
    setCurrentTab('music');
    setStatusMessage(`Imported ${imported.length} music file${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`);
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Media Library">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <ToolbarButton primary onClick={() => void importMedia()}>Import Media</ToolbarButton>
          <ToolbarButton onClick={() => void importMusic()}>Import Music</ToolbarButton>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename or tag"
            style={{
              flex: 1,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(13, 16, 22, 0.92)',
              color: '#f6f7f9',
              padding: '10px 14px'
            }}
          />
        </div>
        <VirtualList
          items={assets}
          estimateSize={94}
          renderItem={(asset) => (
            <button
              type="button"
              onClick={() => selectAsset(asset.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f6f7f9',
                borderRadius: 16,
                padding: 14
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{asset.label ?? asset.filename}</div>
                  <div style={{ color: muted, fontSize: 13 }}>{asset.path.absolutePath}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={pillStyle()}>{asset.mediaType}</span>
                  <span style={pillStyle(asset.analysisStatus === 'completed' ? 'success' : 'warn')}>{asset.analysisStatus}</span>
                </div>
              </div>
            </button>
          )}
        />
      </Panel>
    </div>
  );
}

function AnalysisView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const selectedAssetId = useUiStore((state) => state.selectedAssetId);
  const allJobs = useJobsStore((state) => state.jobs);
  const jobs = useMemo(() => allJobs.filter((job) => job.type === 'analysis'), [allJobs]);

  const assetIds = selectedAssetId ? [selectedAssetId] : project.assets.filter((asset) => asset.mediaType !== 'image').map((asset) => asset.id);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Analysis">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <ToolbarButton primary onClick={() => void api.jobs.runAnalysis({ project, projectRoot, assetIds })}>Run Analysis</ToolbarButton>
          <ToolbarButton onClick={() => void api.jobs.runAnalysis({ project, projectRoot, assetIds })}>Rerun Selected</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {project.assets.map((asset) => (
            <div key={asset.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{asset.label ?? asset.filename}</strong>
                <span style={pillStyle(asset.analysisStatus === 'completed' ? 'success' : 'warn')}>{asset.analysisStatus}</span>
              </div>
              <div style={{ color: muted, marginTop: 8 }}>
                Analysis sidecars: {project.analysisRefs.filter((ref) => ref.assetId === asset.id).length}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Background Jobs">
        <div style={{ display: 'grid', gap: 8 }}>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CutsView() {
  const project = useProjectSessionStore((state) => state.project);
  const selectCut = useUiStore((state) => state.selectCut);
  const addCutToSequence = useProjectSessionStore((state) => state.addCutToSequence);
  const updateCutStatus = useProjectSessionStore((state) => state.updateCutStatus);
  const toggleCutFavorite = useProjectSessionStore((state) => state.toggleCutFavorite);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const cuts = useMemo(() => project.cutCandidates.filter((cut) =>
    `${cut.id} ${(cut.tags ?? []).join(' ')}`.toLowerCase().includes(deferredQuery.toLowerCase())
  ), [deferredQuery, project.cutCandidates]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Cut Browser">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter cuts by id or tag"
          style={{
            width: '100%',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13, 16, 22, 0.92)',
            color: '#f6f7f9',
            padding: '10px 14px',
            marginBottom: 16
          }}
        />
        <VirtualList
          items={cuts}
          estimateSize={136}
          renderItem={(cut) => (
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <button type="button" onClick={() => selectCut(cut.id)} style={{ background: 'transparent', border: 'none', color: '#f6f7f9', textAlign: 'left', padding: 0 }}>
                  <div style={{ fontWeight: 700 }}>{cut.id}</div>
                  <div style={{ color: muted, fontSize: 13 }}>{cut.startMs}ms {'->'} {cut.endMs}ms</div>
                </button>
                <span style={pillStyle(cut.favorite ? 'success' : 'default')}>{cut.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <ToolbarButton onClick={() => addCutToSequence(cut.id)}>Add</ToolbarButton>
                <ToolbarButton onClick={() => updateCutStatus(cut.id, 'kept')}>Keep</ToolbarButton>
                <ToolbarButton onClick={() => updateCutStatus(cut.id, 'rejected')}>Reject</ToolbarButton>
                <ToolbarButton onClick={() => toggleCutFavorite(cut.id)}>Favorite</ToolbarButton>
              </div>
            </div>
          )}
        />
      </Panel>
    </div>
  );
}

function SequenceView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const previewPath = useUiStore((state) => state.previewPath);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const moveClipAction = useProjectSessionStore((state) => state.moveClip);
  const trimClipAction = useProjectSessionStore((state) => state.trimClip);
  const duplicateVariantAction = useProjectSessionStore((state) => state.duplicateVariant);
  const addMarkerAction = useProjectSessionStore((state) => state.addMarker);
  const addSectionAction = useProjectSessionStore((state) => state.addSection);

  const variant = useMemo(() => project.variants.find((candidate) => candidate.id === (selectedVariantId ?? getDefaultVariant(project)?.id)) ?? project.variants[0], [project, selectedVariantId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.95fr', gap: 16 }}>
      <Panel title="Sequence Builder">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {project.variants.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => selectVariant(candidate.id)}
              style={{
                ...buttonStyle(candidate.id === variant?.id),
                background: candidate.id === variant?.id ? 'linear-gradient(135deg, #ff9f7f, #f48762)' : 'rgba(255,255,255,0.05)',
                color: candidate.id === variant?.id ? '#130f12' : '#f6f7f9'
              }}
            >
              {candidate.name}
            </button>
          ))}
          <ToolbarButton onClick={() => variant && duplicateVariantAction(variant.id)}>Duplicate Variant</ToolbarButton>
          <ToolbarButton onClick={() => variant && addMarkerAction(variant.id, `Marker ${Date.now() % 1000}`, 500)}>Add Marker</ToolbarButton>
          <ToolbarButton onClick={() => variant && addSectionAction(variant.id, `Section ${Date.now() % 1000}`, 0, 1500)}>Add Section</ToolbarButton>
          <ToolbarButton primary onClick={() => variant && void api.jobs.runPreview({
            project,
            projectRoot,
            variantId: variant.id,
            outputPath: `${projectRoot}/.afterimage/preview/${variant.id}.mp4`
          }).then((job) => setPreviewPath(job?.result?.outputPath ?? `${projectRoot}/.afterimage/preview/${variant.id}.mp4`))}>Build Preview</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {(variant?.clips ?? []).map((clip) => (
            <div key={clip.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <strong>{clip.id}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>timeline {clip.timelineStartMs}ms | source {clip.sourceStartMs}ms | duration {clip.durationMs}ms</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ToolbarButton onClick={() => variant && moveClipAction(variant.id, clip.id, -1)}>Up</ToolbarButton>
                  <ToolbarButton onClick={() => variant && moveClipAction(variant.id, clip.id, 1)}>Down</ToolbarButton>
                  <ToolbarButton onClick={() => variant && trimClipAction(variant.id, clip.id, -250)}>[</ToolbarButton>
                  <ToolbarButton onClick={() => variant && trimClipAction(variant.id, clip.id, 250)}>]</ToolbarButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Preview">
        <div style={{ marginBottom: 12, color: muted }}>Low-resolution cached preview. Timing is authoritative; image quality is not final render quality.</div>
        {previewPath ? (
          <video
            key={previewPath}
            controls
            src={toMediaSrc(previewPath)}
            style={{ width: '100%', borderRadius: 18, background: '#090a0d', aspectRatio: '16 / 9' }}
          />
        ) : (
          <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, minHeight: 220, display: 'grid', placeItems: 'center', color: muted }}>
            Build a preview cache to audition the current sequence.
          </div>
        )}
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {(variant?.markers ?? []).map((marker) => (
            <div key={marker.id} style={{ color: '#f6f7f9' }}>{marker.label} at {marker.timeMs}ms</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MusicView() {
  const project = useProjectSessionStore((state) => state.project);
  const variant = getDefaultVariant(project);
  const musicAsset = variant?.musicAlignment?.primaryAssetId
    ? project.assets.find((asset) => asset.id === variant.musicAlignment?.primaryAssetId)
    : project.assets.find((asset) => asset.mediaType === 'audio');

  return (
    <Panel title="Music Sync">
      <div style={{ color: muted, marginBottom: 16 }}>Manual marker placement stays first-class. Beat markers are editable project data, not ephemeral preview state.</div>
      {musicAsset ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <strong>{musicAsset.label ?? musicAsset.filename}</strong>
            <div style={{ color: muted }}>Duration {musicAsset.durationMs ?? 0}ms</div>
          </div>
          {(variant?.musicAlignment?.beatMarkers ?? []).map((marker) => (
            <div key={marker.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 }}>
              {marker.label} at {marker.timeMs}ms
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: muted }}>Import a music track to author beat markers and sections.</div>
      )}
    </Panel>
  );
}

function StyleView() {
  const project = useProjectSessionStore((state) => state.project);
  const addFilter = useProjectSessionStore((state) => state.addFilterToSequenceStack);
  const toggleFilter = useProjectSessionStore((state) => state.toggleFilterEnabled);
  const randomizeFilter = useProjectSessionStore((state) => state.safeRandomizeFilter);
  const randomizeStack = useProjectSessionStore((state) => state.safeRandomizeStack);
  const selectFilter = useUiStore((state) => state.selectFilter);
  const stack = project.filterStacks[0];
  const presets = useMemo(() => loadPresetLibrary().presets, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
      <Panel title="Style Stack">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <ToolbarButton primary onClick={() => addFilter('contrast-pulse')}>Add Contrast</ToolbarButton>
          <ToolbarButton onClick={() => addFilter('glitch-bands')}>Add Glitch</ToolbarButton>
          <ToolbarButton onClick={() => stack && randomizeStack(stack.id)}>Randomize Stack</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {stack?.filters.map((filter) => (
            <div key={filter.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <button type="button" onClick={() => selectFilter(filter.id)} style={{ border: 'none', background: 'transparent', color: '#f6f7f9', padding: 0, textAlign: 'left' }}>
                  <strong>{filter.type}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>mix {Number(filter.mix ?? 1).toFixed(2)}</div>
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ToolbarButton onClick={() => stack && toggleFilter(stack.id, filter.id)}>{filter.enabled === false ? 'Enable' : 'Bypass'}</ToolbarButton>
                  <ToolbarButton onClick={() => stack && randomizeFilter(stack.id, filter.id)}>Randomize</ToolbarButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Preset Families">
        <div style={{ display: 'grid', gap: 10 }}>
          {presets.map((preset) => (
            <div key={preset.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{preset.name}</strong>
                <span style={pillStyle()}>{preset.family}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AutomationView() {
  const project = useProjectSessionStore((state) => state.project);
  const addLane = useProjectSessionStore((state) => state.addAutomationLane);
  const addKeyframe = useProjectSessionStore((state) => state.addLaneKeyframe);
  const resetLane = useProjectSessionStore((state) => state.resetLane);
  const targetFilterId = project.filterStacks[0]?.filters[0]?.id;

  return (
    <Panel title="Automation">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <ToolbarButton primary onClick={() => targetFilterId && addLane(targetFilterId, `Lane ${project.automationLanes.length + 1}`)}>Add Lane</ToolbarButton>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {project.automationLanes.map((lane) => (
          <div key={lane.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{lane.name}</strong>
                <div style={{ color: muted, fontSize: 13 }}>Target {lane.target.filterId} {'->'} {lane.target.property}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ToolbarButton onClick={() => addKeyframe(lane.id, lane.keyframes.length * 500 + 500, 0.8)}>Add Keyframe</ToolbarButton>
                <ToolbarButton onClick={() => resetLane(lane.id)}>Reset</ToolbarButton>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {lane.keyframes.map((keyframe) => (
                <div key={keyframe.id} style={{ color: muted }}>{keyframe.timeMs}ms {'->'} {keyframe.value.toFixed(2)}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ExportView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const toggleProfile = useProjectSessionStore((state) => state.toggleExportProfile);
  const allJobs = useJobsStore((state) => state.jobs);
  const exportJobs = useMemo(() => allJobs.filter((job) => job.type === 'export'), [allJobs]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Export Profiles">
        <div style={{ display: 'grid', gap: 10 }}>
          {exportProfiles.map((profile) => {
            const selection = project.exportSelections.find((item) => item.profileId === profile.id);
            return (
              <label key={profile.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
                <div>
                  <strong>{profile.name}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>{profile.width} x {profile.height} | {profile.container}</div>
                </div>
                <input
                  type="checkbox"
                  checked={selection?.enabled ?? false}
                  onChange={() => toggleProfile(profile.id)}
                />
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <ToolbarButton primary onClick={() => void api.jobs.runExport({
            project,
            projectRoot,
            outputPath: `${projectRoot}/exports/${project.id}`,
            profileIds: getEnabledExportProfileIds(project.exportSelections),
            selections: project.exportSelections
          })}>Export Enabled Profiles</ToolbarButton>
        </div>
      </Panel>
      <Panel title="Render Queue">
        <div style={{ display: 'grid', gap: 8 }}>
          {exportJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function DiagnosticsView() {
  const report = useDiagnosticsStore((state) => state.report);
  const logs = useDiagnosticsStore((state) => state.logs);
  const jobs = useJobsStore((state) => state.jobs);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Diagnostics">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <StatCard label="FFmpeg" value={report?.toolchain.available ? 'Available' : 'Unavailable'} tone={report?.toolchain.available ? 'success' : 'warn'} />
          <StatCard label="Warnings" value={String(report?.warnings.length ?? 0)} tone={report && report.warnings.length > 0 ? 'warn' : 'default'} />
          <StatCard label="Missing Media" value={String(report?.missingMedia.length ?? 0)} tone={report && report.missingMedia.length > 0 ? 'warn' : 'default'} />
        </div>
      </Panel>
      <Panel title="Environment">
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(report?.environmentSummary ?? {}).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: muted }}>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Job Log">
        <div style={{ display: 'grid', gap: 8 }}>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </Panel>
      <Panel title="Application Log">
        <div style={{ display: 'grid', gap: 8 }}>
          {logs.length === 0 ? (
            <div style={{ color: muted }}>No log entries yet.</div>
          ) : (
            logs.slice().reverse().map((entry) => (
              <div key={entry.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{entry.message}</strong>
                  <span style={pillStyle(entry.level === 'error' ? 'warn' : entry.level === 'warn' ? 'warn' : 'default')}>{entry.level}</span>
                </div>
                <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>{entry.timestamp}</div>
                {entry.details ? <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>{entry.details}</div> : null}
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function JobRow({ job }: { job: DesktopJob }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong>{job.type}</strong>
          <div style={{ color: muted, fontSize: 13 }}>{job.target}</div>
        </div>
        <span style={pillStyle(job.status === 'completed' ? 'success' : job.status === 'failed' ? 'warn' : 'default')}>{job.status}</span>
      </div>
      {job.log.length > 0 ? (
        <div style={{ color: muted, fontSize: 13, marginTop: 10 }}>{job.log[job.log.length - 1]}</div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warn' }) {
  return (
    <div style={{ borderRadius: 18, padding: 16, background: 'linear-gradient(145deg, rgba(23, 28, 38, 0.98), rgba(14, 17, 24, 0.92))', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ color: muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{value}</div>
      <div style={{ marginTop: 12 }}>
        <span style={pillStyle(tone)}>{tone === 'default' ? 'stable' : tone}</span>
      </div>
    </div>
  );
}

function ActiveView() {
  const currentTab = useUiStore((state) => state.currentTab);

  switch (currentTab) {
    case 'project':
      return <ProjectView />;
    case 'media':
      return <MediaView />;
    case 'analysis':
      return <AnalysisView />;
    case 'cuts':
      return <CutsView />;
    case 'sequence':
      return <SequenceView />;
    case 'music':
      return <MusicView />;
    case 'style':
      return <StyleView />;
    case 'automation':
      return <AutomationView />;
    case 'export':
      return <ExportView />;
    case 'diagnostics':
      return <DiagnosticsView />;
    default:
      return <ProjectView />;
  }
}

export function App() {
  useDesktopBootstrap();
  useKeyboardShortcuts();

  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const statusMessage = useUiStore((state) => state.statusMessage);
  const project = useProjectSessionStore((state) => state.project);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const jobs = useJobsStore((state) => state.jobs);

  return (
    <Screen>
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top left, rgba(244, 135, 98, 0.18), transparent 28%), radial-gradient(circle at bottom right, rgba(91, 137, 255, 0.12), transparent 22%), linear-gradient(180deg, #0c0f14, #0a0d12 55%, #090b10)',
        color: '#f6f7f9',
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        padding: 24
      }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ color: accent, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12, fontWeight: 800 }}>Afterimage Studio Desktop</div>
            <h1 style={{ margin: '8px 0 4px', fontSize: 34 }}>Offline authoring workstation</h1>
            <div style={{ color: muted }}>{project.name} • {project.assets.length} assets • {project.cutCandidates.length} cuts • {jobs.filter((job) => job.status === 'running').length} active jobs</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={pillStyle(dirty ? 'warn' : 'success')}>{dirty ? 'Unsaved project' : 'Saved project'}</span>
            <span style={pillStyle()}>{currentTab}</span>
          </div>
        </header>

        {statusMessage ? (
          <div style={{
            marginBottom: 16,
            borderRadius: 16,
            padding: '12px 16px',
            border: '1px solid rgba(255, 159, 127, 0.35)',
            background: 'linear-gradient(135deg, rgba(244, 135, 98, 0.15), rgba(255,255,255,0.03))'
          }}>
            {statusMessage}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: 18 }}>
          <aside style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentTab(tab.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 18,
                  border: tab.id === currentTab ? '1px solid rgba(255, 159, 127, 0.48)' : '1px solid rgba(255,255,255,0.07)',
                  background: tab.id === currentTab ? 'linear-gradient(135deg, rgba(244, 135, 98, 0.18), rgba(255,255,255,0.03))' : 'rgba(18, 21, 29, 0.92)',
                  color: '#f6f7f9',
                  padding: '14px 16px',
                  fontWeight: 700
                }}
              >
                {tab.label}
              </button>
            ))}
          </aside>

          <main style={{ display: 'grid', gap: 16 }}>
            <ActiveView />
          </main>
        </div>
      </div>
    </Screen>
  );
}
