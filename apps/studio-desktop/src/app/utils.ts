import type { ExportProfileId } from '@afterimage/export-profiles';
import type { StudioTab } from '../stores/ui-store';

export const tabs: Array<{ id: StudioTab; label: string }> = [
  { id: 'project', label: 'Project' },
  { id: 'media', label: 'Media' },
  { id: 'cuts', label: 'Cuts' },
  { id: 'world', label: 'World' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'music', label: 'Music' },
  { id: 'style', label: 'Style' },
  { id: 'automation', label: 'Automation' },
  { id: 'export', label: 'Export' },
  { id: 'observatory', label: 'Observatory' },
  { id: 'diagnostics', label: 'Diagnostics' }
];

export function resolveProjectFilePath(projectFilePath: string | undefined, projectRoot: string | undefined, projectFileName: string | undefined): string | undefined {
  if (projectFilePath) {
    return projectFilePath;
  }

  if (!projectRoot || !projectFileName) {
    return undefined;
  }

  return `${projectRoot.replace(/\/$/, '')}/${projectFileName}`;
}

export function getEnabledExportProfileIds(profileIds: Array<{ enabled?: boolean; profileId: string }>): ExportProfileId[] {
  return profileIds
    .filter((selection) => selection.enabled)
    .map((selection) => selection.profileId as ExportProfileId);
}

export function toMediaSrc(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  if (path.startsWith('afterimage-file://')) {
    return path;
  }

  if (path.startsWith('file://')) {
    try {
      const fileUrl = new URL(path);
      return `afterimage-file://local${encodeURI(decodeURIComponent(fileUrl.pathname))}`;
    } catch {
      return path;
    }
  }

  return path.startsWith('/') ? `afterimage-file://local${encodeURI(path)}` : path;
}
