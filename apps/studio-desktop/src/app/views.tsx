import type { ComponentType } from 'react';
import { type StudioTab, useUiStore } from '../stores/ui-store';
import { ProjectView } from '../features/project-overview/views';
import { CatalogView, MediaView } from '../features/media-library/views';
import { CutsView } from '../features/scene-analysis/views';
import { SequenceView } from '../features/sequence-builder/views';
import { MusicView } from '../features/music-sync/views';
import { StyleView } from '../features/filter-stack/views';
import { AutomationView } from '../features/automation/views';
import { ExportView } from '../features/export/views';
import { DiagnosticsView } from '../features/diagnostics/views';

const viewMap: Record<StudioTab, ComponentType> = {
  project: ProjectView,
  catalog: CatalogView,
  media: MediaView,
  cuts: CutsView,
  sequence: SequenceView,
  music: MusicView,
  style: StyleView,
  automation: AutomationView,
  export: ExportView,
  diagnostics: DiagnosticsView
};

export function ActiveView() {
  const activeTab = useUiStore((state) => state.currentTab);
  const View = viewMap[activeTab];
  return (
    <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0, minWidth: 0 }}>
      <View />
    </div>
  );
}
