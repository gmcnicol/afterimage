import type { DesktopJob, RunAnalysisRequest, RunExportRequest, RunPreviewRequest } from '@afterimage/studio-contracts';
import { describe, expect, it, vi } from 'vitest';
import { retryPayload } from '../electron/services/jobs/retry';

const retriedJob: DesktopJob = {
  id: 'job-retry-1',
  type: 'preview',
  target: 'target',
  status: 'queued',
  log: []
};

describe('job retry payload handling', () => {
  it('routes analysis retry payloads through runAnalysis and returns the first queued job', async () => {
    const analysisPayload = {
      kind: 'analysis',
      project: { id: 'project' },
      projectRoot: '/tmp/project',
      assetIds: ['asset-1']
    } as unknown as { kind: 'analysis' } & RunAnalysisRequest;
    const runAnalysis = vi.fn(async () => [retriedJob]);

    await expect(retryPayload(analysisPayload, {
      runAnalysis,
      runPreview: vi.fn(),
      runExport: vi.fn()
    })).resolves.toBe(retriedJob);

    expect(runAnalysis).toHaveBeenCalledWith(analysisPayload);
  });

  it('routes preview retry payloads through runPreview', async () => {
    const previewPayload = {
      kind: 'preview',
      project: { id: 'project' },
      projectRoot: '/tmp/project',
      outputPath: '/tmp/project/.afterimage/preview/cache.mp4'
    } as unknown as { kind: 'preview' } & RunPreviewRequest;
    const runPreview = vi.fn(async () => retriedJob);

    await expect(retryPayload(previewPayload, {
      runAnalysis: vi.fn(),
      runPreview,
      runExport: vi.fn()
    })).resolves.toBe(retriedJob);

    expect(runPreview).toHaveBeenCalledWith(previewPayload);
  });

  it('routes export retry payloads through runExport and returns null when nothing is queued', async () => {
    const exportPayload = {
      kind: 'export',
      project: { id: 'project' },
      projectRoot: '/tmp/project',
      outputPath: '/tmp/project/exports/render',
      profileIds: ['web-h264']
    } as unknown as { kind: 'export' } & RunExportRequest;
    const runExport = vi.fn(async () => []);

    await expect(retryPayload(exportPayload, {
      runAnalysis: vi.fn(),
      runPreview: vi.fn(),
      runExport
    })).resolves.toBeNull();

    expect(runExport).toHaveBeenCalledWith(exportPayload);
  });
});
