import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { Dialog, Shell } from 'electron';
import { executeCommandSpec, resolveFfmpegTools } from '@afterimage/ffmpeg-compiler';
import { parseFfprobeOutput } from '@afterimage/media-analysis';
import {
  createEmptyProject,
  normalizeProjectPathRef,
  slugify,
  type MediaAsset,
  type ProjectPathRef
} from '@afterimage/project-model';
import { parseAnalysis, parseProject } from '@afterimage/schema-validators';
import type {
  ProjectSessionSnapshot,
  RelinkAssetResult,
  SaveProjectRequest
} from '../../src/shared/contracts.js';
import type { Logger } from './logger.js';

interface ProjectServiceOptions {
  dialog: Dialog;
  shell: Shell;
  logger: Logger;
  recentProjectsPath: string;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function inferMediaType(filePath: string, kind: 'media' | 'music'): MediaAsset['mediaType'] {
  const lower = filePath.toLowerCase();
  if (kind === 'music' || /\.(wav|mp3|aif|aiff|flac|m4a)$/i.test(lower)) {
    return 'audio';
  }
  if (/\.(png|jpg|jpeg|webp|gif)$/i.test(lower)) {
    return 'image';
  }
  return 'video';
}

function buildPathRef(projectRoot: string, absolutePath: string): ProjectPathRef {
  const nextRelative = relative(projectRoot, absolutePath);
  return normalizeProjectPathRef({
    absolutePath,
    relativePath: nextRelative.startsWith('..') ? undefined : nextRelative.replace(/\\/g, '/')
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureProjectStructure(projectRoot: string): Promise<void> {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'analysis'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'thumbnails'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'waveforms'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'preview'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'logs'), { recursive: true }),
    mkdir(join(projectRoot, 'exports'), { recursive: true })
  ]);
}

async function readRecentProjects(recentProjectsPath: string): Promise<string[]> {
  try {
    const raw = await readFile(recentProjectsPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeRecentProjects(recentProjectsPath: string, recentProjects: string[]): Promise<void> {
  await mkdir(dirname(recentProjectsPath), { recursive: true });
  await writeFile(recentProjectsPath, JSON.stringify(recentProjects.slice(0, 12), null, 2), 'utf8');
}

export function createProjectService({ dialog, shell, logger, recentProjectsPath }: ProjectServiceOptions) {
  let cachedSession: ProjectSessionSnapshot | undefined;

  async function rememberRecentProject(projectFilePath: string): Promise<string[]> {
    const recentProjects = await readRecentProjects(recentProjectsPath);
    const nextRecentProjects = [projectFilePath, ...recentProjects.filter((item) => item !== projectFilePath)].slice(0, 12);
    await writeRecentProjects(recentProjectsPath, nextRecentProjects);
    return nextRecentProjects;
  }

  function cacheSession(session: ProjectSessionSnapshot): ProjectSessionSnapshot {
    cachedSession = session;
    return session;
  }

  async function readProjectSession(projectFilePath: string, recentProjects: string[]): Promise<ProjectSessionSnapshot> {
    const projectRoot = dirname(projectFilePath);
    const raw = await readFile(projectFilePath, 'utf8');
    const project = parseProject(JSON.parse(raw) as unknown);
    logger.setProjectRoot(projectRoot);

    return {
      project,
      projectFilePath,
      projectRoot,
      recentProjects
    };
  }

  async function writeProjectFile(projectRoot: string, project: SaveProjectRequest['project']) {
    await ensureProjectStructure(projectRoot);
    const projectFileName = project.metadata?.projectFileName ?? `${slugify(project.name) || 'afterimage-project'}.afterimage.json`;
    const projectFilePath = join(projectRoot, projectFileName);
    const nextProject = parseProject({
      ...project,
      metadata: {
        ...project.metadata,
        projectFileName,
        updatedAt: new Date().toISOString()
      }
    });

    await writeFile(projectFilePath, `${JSON.stringify(nextProject, null, 2)}\n`, 'utf8');
    logger.setProjectRoot(projectRoot);
    await logger.log('info', 'Saved project file.', projectFilePath);
    return {
      project: nextProject,
      projectFilePath,
      projectRoot
    };
  }

  async function probeImportedAsset(filePath: string): Promise<Pick<MediaAsset, 'durationMs' | 'hasAudio'>> {
    const tools = resolveFfmpegTools();
    const probeResult = await executeCommandSpec({
      label: `probe:import:${basename(filePath)}`,
      binary: tools.ffprobe.path,
      args: [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]
    });
    const probe = parseFfprobeOutput(probeResult.stdout);

    return {
      durationMs: probe.durationMs,
      hasAudio: probe.streams.some((stream) => stream.codecType === 'audio')
    };
  }

  async function mapImportedAsset(filePath: string, kind: 'media' | 'music', projectRoot?: string): Promise<MediaAsset> {
    const stem = basename(filePath, extname(filePath));
    const mediaType = kind === 'music' ? 'audio' : inferMediaType(filePath, kind);
    const fallbackHasAudio = kind === 'music' || mediaType === 'audio' || !/\.(png|jpg|jpeg|webp|gif)$/i.test(filePath);
    let probeMetadata: Pick<MediaAsset, 'durationMs' | 'hasAudio'> | undefined;

    if (mediaType !== 'image') {
      try {
        probeMetadata = await probeImportedAsset(filePath);
      } catch (error) {
        await logger.log('warn', 'Failed to probe imported media.', `${filePath} :: ${getErrorMessage(error)}`);
      }
    }

    return {
      id: `asset-${slugify(stem)}-${stableHash(filePath).slice(0, 6)}`,
      filename: basename(filePath),
      mediaType,
      path: projectRoot ? buildPathRef(projectRoot, filePath) : { absolutePath: filePath },
      label: stem,
      durationMs: probeMetadata?.durationMs,
      hasAudio: probeMetadata?.hasAudio ?? fallbackHasAudio,
      importStatus: 'ready',
      analysisStatus: mediaType === 'image' ? 'completed' : 'pending',
      tags: kind === 'music' ? ['music'] : []
    };
  }

  return {
    async getInitialState(): Promise<ProjectSessionSnapshot> {
      if (cachedSession) {
        return cachedSession;
      }

      const recentProjects = await readRecentProjects(recentProjectsPath);
      const mostRecentProject = recentProjects[0];

      if (mostRecentProject) {
        try {
          return cacheSession(await readProjectSession(mostRecentProject, recentProjects));
        } catch (error) {
          await logger.log('warn', 'Failed to restore recent project file.', `${mostRecentProject} :: ${getErrorMessage(error)}`);
        }
      }

      return cacheSession({
        project: createEmptyProject({
          id: 'project-studio-desktop',
          name: 'Studio Desktop'
        }),
        recentProjects
      });
    },
    async createProject(options: { name?: string } = {}): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Choose Project Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const projectRoot = result.filePaths[0];
      const projectName = options.name ?? basename(projectRoot);
      const project = createEmptyProject({
        id: slugify(projectName) || 'afterimage-project',
        name: projectName
      });
      const session = await writeProjectFile(projectRoot, project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);

      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async openProject(): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Open Afterimage Project',
        properties: ['openFile'],
        filters: [{ name: 'Afterimage Project', extensions: ['json'] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return this.openProjectAt(result.filePaths[0]);
    },
    async openProjectAt(projectFilePath: string): Promise<ProjectSessionSnapshot> {
      const recentProjects = await rememberRecentProject(projectFilePath);
      return cacheSession(await readProjectSession(projectFilePath, recentProjects));
    },
    async saveProject(input: SaveProjectRequest): Promise<ProjectSessionSnapshot> {
      const projectRoot = input.projectFilePath ? dirname(input.projectFilePath) : undefined;

      if (!projectRoot) {
        const session = await this.saveProjectAs(input);
        if (!session) {
          throw new Error('Save As was cancelled.');
        }
        return session;
      }

      const session = await writeProjectFile(projectRoot, input.project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async saveProjectAs(input: SaveProjectRequest): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Choose Project Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const session = await writeProjectFile(result.filePaths[0], input.project);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async duplicateProject(input: SaveProjectRequest): Promise<ProjectSessionSnapshot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Choose Destination Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const duplicateProject = parseProject({
        ...input.project,
        id: `${input.project.id}-copy`,
        name: `${input.project.name} Copy`
      });
      const session = await writeProjectFile(result.filePaths[0], duplicateProject);
      const recentProjects = await rememberRecentProject(session.projectFilePath);
      return cacheSession({
        ...session,
        recentProjects
      });
    },
    async revealProjectFolder(projectFilePath: string): Promise<void> {
      shell.showItemInFolder(projectFilePath);
    },
    async loadAnalysis(analysisPath: string) {
      try {
        const raw = await readFile(analysisPath, 'utf8');
        return parseAnalysis(JSON.parse(raw) as unknown);
      } catch (error) {
        await logger.log('warn', 'Failed to load analysis sidecar.', `${analysisPath} :: ${getErrorMessage(error)}`);
        return null;
      }
    },
    async importMedia(projectRoot?: string): Promise<MediaAsset[]> {
      const result = await dialog.showOpenDialog({
        title: 'Import Media',
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled) {
        await logger.log('info', 'Media import cancelled.');
        return [];
      }

      const assets = await Promise.all(result.filePaths.map((filePath) => mapImportedAsset(filePath, 'media', projectRoot)));
      await logger.log('info', 'Imported media files.', `${assets.length} file(s)${projectRoot ? '' : ' into unsaved project state'}`);
      return assets;
    },
    async importMusic(projectRoot?: string): Promise<MediaAsset[]> {
      const result = await dialog.showOpenDialog({
        title: 'Import Music',
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled) {
        await logger.log('info', 'Music import cancelled.');
        return [];
      }

      const assets = await Promise.all(result.filePaths.map((filePath) => mapImportedAsset(filePath, 'music', projectRoot)));
      await logger.log('info', 'Imported music files.', `${assets.length} file(s)${projectRoot ? '' : ' into unsaved project state'}`);
      return assets;
    },
    async relinkAsset(input: { projectRoot: string; assetId: string; currentPath?: string }): Promise<RelinkAssetResult | null> {
      const result = await dialog.showOpenDialog({
        title: 'Relink Missing Asset',
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        await logger.log('info', 'Relink cancelled.', input.assetId);
        return null;
      }

      const relinkedAsset = {
        assetId: input.assetId,
        path: buildPathRef(input.projectRoot, result.filePaths[0])
      };
      await logger.log('info', 'Relinked asset.', input.assetId);
      return relinkedAsset;
    }
  };
}
