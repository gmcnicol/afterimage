import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesktopJob, StudioAgentOutput } from '@afterimage/studio-contracts';
import { parseProject } from '@afterimage/schema-validators';
import { describe, expect, it, vi } from 'vitest';
import { fixtureProject } from '../../../packages/test-fixtures/src';
import { createExportJobs } from '../electron/services/jobs/export-job';
import { createPreviewJobs } from '../electron/services/jobs/preview-job';
import type { EnqueueJobInput } from '../electron/services/jobs/types';
import type { Logger } from '../electron/services/logger';

function createFakeFfmpegTools(): { ffmpegPath: string; ffprobePath: string } {
  const binDir = mkdtempSync(join(tmpdir(), 'afterimage-render-job-tools-'));
  const ffmpegPath = join(binDir, 'ffmpeg');
  const ffprobePath = join(binDir, 'ffprobe');
  const script = [
    '#!/bin/sh',
    'out=""',
    'for arg in "$@"; do out="$arg"; done',
    'mkdir -p "$(dirname "$out")"',
    ': > "$out"',
    'printf "out_time_us=1000000\\nprogress=end\\n" >&3 2>/dev/null || true',
    'exit 0',
    ''
  ].join('\n');

  writeFileSync(ffmpegPath, script, 'utf8');
  writeFileSync(ffprobePath, '#!/bin/sh\nexit 0\n', 'utf8');
  chmodSync(ffmpegPath, 0o755);
  chmodSync(ffprobePath, 0o755);

  return { ffmpegPath, ffprobePath };
}

async function withFakeFfmpeg<T>(run: () => Promise<T>): Promise<T> {
  const previousFfmpeg = process.env.AFTERIMAGE_FFMPEG_PATH;
  const previousFfprobe = process.env.AFTERIMAGE_FFPROBE_PATH;
  const tools = createFakeFfmpegTools();
  process.env.AFTERIMAGE_FFMPEG_PATH = tools.ffmpegPath;
  process.env.AFTERIMAGE_FFPROBE_PATH = tools.ffprobePath;

  try {
    return await run();
  } finally {
    if (previousFfmpeg === undefined) {
      delete process.env.AFTERIMAGE_FFMPEG_PATH;
    } else {
      process.env.AFTERIMAGE_FFMPEG_PATH = previousFfmpeg;
    }
    if (previousFfprobe === undefined) {
      delete process.env.AFTERIMAGE_FFPROBE_PATH;
    } else {
      process.env.AFTERIMAGE_FFPROBE_PATH = previousFfprobe;
    }
  }
}

function createCapturingEnqueue() {
  let input: EnqueueJobInput | undefined;
  const enqueue = vi.fn((nextInput: EnqueueJobInput): DesktopJob => {
    input = nextInput;
    return {
      id: `job-${nextInput.type}-1`,
      type: nextInput.type,
      target: nextInput.target,
      status: 'queued',
      log: []
    };
  });

  return {
    enqueue,
    async run(): Promise<StudioAgentOutput> {
      if (!input) {
        throw new Error('Expected job to be enqueued.');
      }

      return await input.run(new AbortController().signal, () => undefined);
    }
  };
}

function createLogger(): Logger {
  return {
    log: vi.fn(async () => undefined)
  } as unknown as Logger;
}

describe('render job artifact metadata', () => {
  it('returns the final preview artifact after the temp render is renamed', async () => {
    await withFakeFfmpeg(async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'afterimage-preview-job-'));
      const outputPath = join(projectRoot, '.afterimage', 'preview', 'cache.mp4');
      const { enqueue, run } = createCapturingEnqueue();
      const { runPreview } = createPreviewJobs({ logger: createLogger(), enqueue });

      runPreview({
        project: parseProject(fixtureProject),
        projectRoot,
        outputPath
      });
      const result = await run();

      expect(result.kind).toBe('preview');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0]).toEqual(expect.objectContaining({
        role: 'preview-output',
        path: outputPath,
        producedBy: 'pass:ffmpeg-render'
      }));
      expect(result.artifacts?.[0]?.id).toContain('artifact:preview-output:');
      expect(result.artifacts?.[0]?.provenance).toEqual(expect.objectContaining({
        mode: 'preview'
      }));
    });
  });

  it('returns capture replay preview artifacts and diagnostics when capture IDs are supplied', async () => {
    await withFakeFfmpeg(async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'afterimage-capture-preview-job-'));
      const outputPath = join(projectRoot, '.afterimage', 'preview', 'cache.mp4');
      const { enqueue, run } = createCapturingEnqueue();
      const { runPreview } = createPreviewJobs({ logger: createLogger(), enqueue });

      runPreview({
        project: parseProject(fixtureProject),
        projectRoot,
        outputPath,
        captureSessionId: 'capture-session-main',
        captureLogId: 'capture-log-main',
        availableArchiveIds: ['archive-source-alpha']
      });
      const result = await run();

      expect(result.kind).toBe('preview');
      expect(result.artifacts).toHaveLength(1);
      expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toContain('FFMPEG_PASS_COMPATIBILITY');
      expect(result.artifacts?.[0]?.provenance.metadata).toEqual(expect.objectContaining({
        captureReplay: expect.objectContaining({
          captureLogId: 'capture-log-main',
          filterOverrideCount: 1
        })
      }));
    });
  });

  it('returns the final export artifact for non-chunked exports', async () => {
    await withFakeFfmpeg(async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'afterimage-export-job-'));
      const outputBasePath = join(projectRoot, 'exports', 'render');
      await mkdir(join(projectRoot, 'exports'), { recursive: true });
      const { enqueue, run } = createCapturingEnqueue();
      const { runExport } = createExportJobs({ logger: createLogger(), enqueue });

      runExport({
        project: parseProject(fixtureProject),
        projectRoot,
        outputPath: outputBasePath,
        profileIds: ['landscape-master']
      });
      const result = await run();

      expect(result.kind).toBe('export');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0]).toEqual(expect.objectContaining({
        role: 'export-output',
        path: `${outputBasePath}-landscape-master.mp4`,
        producedBy: 'pass:ffmpeg-render'
      }));
    });
  });

  it('returns capture replay export artifacts and diagnostics for non-chunked exports', async () => {
    await withFakeFfmpeg(async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'afterimage-capture-export-job-'));
      const outputBasePath = join(projectRoot, 'exports', 'render');
      await mkdir(join(projectRoot, 'exports'), { recursive: true });
      const { enqueue, run } = createCapturingEnqueue();
      const { runExport } = createExportJobs({ logger: createLogger(), enqueue });

      runExport({
        project: parseProject(fixtureProject),
        projectRoot,
        outputPath: outputBasePath,
        profileIds: ['landscape-master'],
        captureSessionId: 'capture-session-main',
        captureLogId: 'capture-log-main',
        availableArchiveIds: ['archive-source-alpha']
      });
      const result = await run();

      expect(result.kind).toBe('export');
      expect(result.artifacts).toHaveLength(1);
      expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toContain('FFMPEG_PASS_COMPATIBILITY');
      expect(result.artifacts?.[0]?.provenance.metadata).toEqual(expect.objectContaining({
        captureReplay: expect.objectContaining({
          captureLogId: 'capture-log-main',
          filterOverrideCount: 1
        })
      }));
    });
  });

  it('returns chunk render artifacts plus the final export artifact for chunked exports', async () => {
    await withFakeFfmpeg(async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'afterimage-chunked-export-job-'));
      const outputBasePath = join(projectRoot, 'exports', 'render');
      const sourceClip = fixtureProject.variants[0].clips[0];
      const chunkedProject = parseProject({
        ...fixtureProject,
        variants: fixtureProject.variants.map((variant) => variant.id === 'variant-main'
          ? {
              ...variant,
              clips: Array.from({ length: 140 }, (_, index) => ({
                ...sourceClip,
                id: index === 0 ? sourceClip.id : `clip-${index + 1}`,
                timelineStartMs: index * 1000,
                durationMs: 1000,
                transition: 'cut'
              }))
            }
          : variant)
      });
      const { enqueue, run } = createCapturingEnqueue();
      const { runExport } = createExportJobs({ logger: createLogger(), enqueue });

      runExport({
        project: chunkedProject,
        projectRoot,
        outputPath: outputBasePath,
        profileIds: ['landscape-master']
      });
      const result = await run();

      expect(result.kind).toBe('export');
      expect(result.artifacts?.filter((artifact) => artifact.role === 'render-output')).toHaveLength(4);
      expect(result.artifacts?.at(-1)).toEqual(expect.objectContaining({
        role: 'finalize-output',
        path: `${outputBasePath}-landscape-master.mp4`,
        producedBy: 'pass:ffmpeg-finalize'
      }));
    });
  });
});
