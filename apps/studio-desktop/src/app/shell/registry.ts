import type { DesktopJob } from '../../lib/studio-client';
import type { StudioSpace, StudioTab } from '../../stores/ui-store';
import type { StudioWorkspaceDefinition, StudioWorkspaceSurface } from './types';

export const studioSurfaces: Record<StudioTab, StudioWorkspaceSurface> = {
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
  export: {
    id: 'export',
    label: 'Export',
    description: 'Delivery profiles, render queue, and capture readiness.'
  },
  diagnostics: {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Toolchain health, missing media, job history, and logs.'
  }
};

export const studioWorkspaces: StudioWorkspaceDefinition[] = [
  {
    id: 'archive',
    label: 'Archive',
    defaultTab: 'project',
    primaryAction: { label: 'Import', targetTab: 'media' },
    surfaces: ['project', 'media', 'catalog'],
    taskRoutes: {
      analysis: { tab: 'media' },
      thumbnails: { tab: 'project' },
      waveform: { tab: 'project' },
      'library-scan': { tab: 'catalog' },
      'library-analysis': { tab: 'catalog' }
    }
  },
  {
    id: 'world',
    label: 'World',
    defaultTab: 'cuts',
    primaryAction: { label: 'Sequence', targetTab: 'sequence' },
    surfaces: ['cuts', 'sequence', 'music', 'style', 'automation']
  },
  {
    id: 'performance',
    label: 'Performance',
    defaultTab: 'sequence',
    primaryAction: { label: 'Rehearse', targetTab: 'sequence' },
    surfaces: ['sequence'],
    taskRoutes: {
      preview: { tab: 'sequence' }
    }
  },
  {
    id: 'capture',
    label: 'Capture',
    defaultTab: 'export',
    primaryAction: { label: 'Export', targetTab: 'export' },
    surfaces: ['export'],
    taskRoutes: {
      export: { tab: 'export' }
    }
  },
  {
    id: 'observatory',
    label: 'Observatory',
    defaultTab: 'diagnostics',
    primaryAction: { label: 'Inspect', targetTab: 'diagnostics' },
    surfaces: ['diagnostics']
  }
];

export function getWorkspaceDefinition(space: StudioSpace): StudioWorkspaceDefinition {
  return studioWorkspaces.find((candidate) => candidate.id === space) ?? studioWorkspaces[0];
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
