import type { ComponentType } from 'react';
import { type StudioTab, useUiStore } from '../stores/ui-store';
import { ProjectView } from '../features/project-overview/views';
import { CatalogView, MediaView } from '../features/media-library/views';
import { ArchiveSpaceView } from '../features/archive-space/views';
import { WorldSpaceView } from '../features/world-space/views';
import { PerformanceSpaceView } from '../features/performance-space/views';
import { CutsView } from '../features/scene-analysis/views';
import { SequenceView } from '../features/sequence-builder/views';
import { MusicView } from '../features/music-sync/views';
import { StyleView } from '../features/filter-stack/views';
import { AutomationView } from '../features/automation/views';
import { ExportView } from '../features/export/views';
import { ObservatorySpaceView } from '../features/diagnostics/views';

const viewMap: Record<StudioTab, ComponentType> = {
  archive: ArchiveSpaceView,
  project: ProjectView,
  catalog: CatalogView,
  media: MediaView,
  world: WorldSpaceView,
  cuts: CutsView,
  sequence: SequenceView,
  performance: PerformanceSpaceView,
  music: MusicView,
  style: StyleView,
  automation: AutomationView,
  export: ExportView,
  observatory: ObservatorySpaceView,
  diagnostics: ObservatorySpaceView
};

export function ActiveView() {
  const activeTab = useUiStore((state) => state.currentTab);
  const View = viewMap[activeTab];
  return (
    <div style={{ display: 'grid', flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
      <View />
    </div>
  );
}
