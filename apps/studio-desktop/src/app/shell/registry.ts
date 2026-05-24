import type { DesktopJob } from '../../lib/studio-client';
import type { StudioSpace, StudioTab } from '../../stores/ui-store';
import type { StudioWorkspaceDefinition, StudioWorkspaceSurface } from './types';

export const studioSurfaces: Record<StudioTab, StudioWorkspaceSurface> = {
  archive: {
    id: 'archive',
    label: 'Archive Space',
    description: 'Memory reservoir, sidecar archaeology, provenance, and archive acceptance.'
  },
  project: {
    id: 'project',
    label: 'Project',
    description: 'Project file, recent sessions, save state, and desktop roots.'
  },
  media: {
    id: 'media',
    label: 'Media',
    description: 'Project imports, source analysis, and project media readiness.'
  },
  catalog: {
    id: 'catalog',
    label: 'Catalogue',
    description: 'Reusable footage, transitions, overlays, and global library scans.'
  },
  cuts: {
    id: 'cuts',
    label: 'Cuts',
    description: 'Cut review queue and keep/reject decisions.'
  },
  world: {
    id: 'world',
    label: 'World',
    description: 'Composition authoring across active scenes, layers, modulation, and render readiness.'
  },
  performance: {
    id: 'performance',
    label: 'Performance Space',
    description: 'Rehearsal, live steering, preview, and replay preview.'
  },
  sequence: {
    id: 'sequence',
    label: 'Sequence',
    description: 'Edit assembly, transitions, markers, and preview renders.'
  },
  music: {
    id: 'music',
    label: 'Music Sync',
    description: 'Cue timing, authored markers, and soundtrack alignment.'
  },
  style: {
    id: 'style',
    label: 'Style',
    description: 'Filter stacks, presets, and authored looks.'
  },
  automation: {
    id: 'automation',
    label: 'Automation',
    description: 'Motion lanes and keyframes for filter parameters.'
  },
  forge: {
    id: 'forge',
    label: 'Forge Space',
    description: 'Forge traversal output, replay artifacts, diagnostics, and recovery.'
  },
  export: {
    id: 'export',
    label: 'Forge Space',
    description: 'Legacy export route mapped to Forge Space.'
  },
  observatory: {
    id: 'observatory',
    label: 'Observatory Space',
    description: 'World explanation, trust, render graph, backend, and activity signals.'
  },
  diagnostics: {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Legacy diagnostics route mapped to Observatory Space.'
  }
};

export const studioWorkspaces: StudioWorkspaceDefinition[] = [
  {
    id: 'archive',
    label: 'Archive',
    defaultTab: 'archive',
    primaryAction: { label: 'Reservoir', targetTab: 'archive' },
    surfaces: ['archive'],
    taskRoutes: {
      analysis: { tab: 'archive' },
      thumbnails: { tab: 'archive' },
      waveform: { tab: 'archive' },
      'library-scan': { tab: 'archive' },
      'library-analysis': { tab: 'archive' }
    }
  },
  {
    id: 'world',
    label: 'World',
    defaultTab: 'world',
    primaryAction: { label: 'Compose', targetTab: 'world' },
    surfaces: ['world', 'cuts', 'sequence', 'music', 'style', 'automation']
  },
  {
    id: 'performance',
    label: 'Performance',
    defaultTab: 'performance',
    primaryAction: { label: 'Preview', targetTab: 'performance' },
    surfaces: ['performance'],
    taskRoutes: {
      preview: { tab: 'performance' }
    }
  },
  {
    id: 'forge',
    label: 'Forge',
    defaultTab: 'forge',
    primaryAction: { label: 'Forge Traversal', targetTab: 'forge' },
    surfaces: ['forge'],
    taskRoutes: {
      export: { tab: 'forge' }
    }
  },
  {
    id: 'observatory',
    label: 'Observatory',
    defaultTab: 'observatory',
    primaryAction: { label: 'Inspect', targetTab: 'observatory' },
    surfaces: ['observatory', 'diagnostics']
  }
];

export function getWorkspaceDefinition(space: StudioSpace): StudioWorkspaceDefinition {
  const normalizedSpace = space === 'capture' ? 'forge' : space;
  return studioWorkspaces.find((candidate) => candidate.id === normalizedSpace) ?? studioWorkspaces[0];
}

export function getWorkspaceSurface(tab: StudioTab): StudioWorkspaceSurface {
  return studioSurfaces[tab];
}

export function getPrimaryWorkspaces(): StudioWorkspaceDefinition[] {
  return studioWorkspaces.filter((space) => space.id !== 'observatory');
}

export function findTaskWorkspace(job: DesktopJob): { workspace: StudioWorkspaceDefinition; tab: StudioTab } | undefined {
  for (const workspace of studioWorkspaces) {
    const route = workspace.taskRoutes?.[job.type];
    if (route) {
      return { workspace, tab: route.tab };
    }
  }

  return undefined;
}
