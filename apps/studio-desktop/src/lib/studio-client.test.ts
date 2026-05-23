import { describe, expect, it, vi } from 'vitest';
import { createStudioClient } from './studio-client';
import type { StudioPreloadBridge } from '@afterimage/studio-contracts';

describe('createStudioClient', () => {
  it('maps project, library, jobs, diagnostics, and shell methods to typed route calls', async () => {
    const invoke = vi.fn(async (_kind: string, route: string) => route);
    const subscribe = vi.fn(() => () => {});
    const bridge = { invoke, subscribe } as unknown as StudioPreloadBridge;
    const client = createStudioClient(bridge);

    await client.project.saveProject({ project: {} as never });
    await client.project.listArchiveSidecars({ projectRoot: '/tmp/project', project: {} as never });
    await client.project.importArchiveSidecars({ projectRoot: '/tmp/project' });
    await client.library.searchAssets({ query: 'clip' });
    await client.jobs.runPreview({ project: {} as never, projectRoot: '/tmp/project', outputPath: '/tmp/out.mp4' });
    await client.diagnostics.getLogs();
    await client.shell.getRuntimeInfo();
    client.jobs.subscribe(() => {});
    client.project.subscribeRecentProjects(() => {});

    expect(invoke).toHaveBeenCalledWith('command', 'project.save', { project: {} });
    expect(invoke).toHaveBeenCalledWith('query', 'project.listArchiveSidecars', { projectRoot: '/tmp/project', project: {} });
    expect(invoke).toHaveBeenCalledWith('command', 'project.importArchiveSidecars', { projectRoot: '/tmp/project' });
    expect(invoke).toHaveBeenCalledWith('query', 'library.searchAssets', { query: 'clip' });
    expect(invoke).toHaveBeenCalledWith('command', 'jobs.runPreview', {
      project: {},
      projectRoot: '/tmp/project',
      outputPath: '/tmp/out.mp4'
    });
    expect(invoke).toHaveBeenCalledWith('query', 'diagnostics.getLogs', undefined);
    expect(invoke).toHaveBeenCalledWith('query', 'shell.getRuntimeInfo', undefined);
    expect(subscribe).toHaveBeenCalledWith('jobs.updated', expect.any(Function));
    expect(subscribe).toHaveBeenCalledWith('project.recentProjectsChanged', expect.any(Function));
  });
});
