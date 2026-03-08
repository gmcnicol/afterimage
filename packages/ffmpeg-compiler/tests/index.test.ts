import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureProject } from '../../test-fixtures/src';
import { parseProject } from '../../schema-validators/src';
import {
  buildAnalysisPlan,
  buildRenderPlan,
  executeCommandSpec,
  resolveFfmpegTools,
  type CommandExecutionResult
} from '../src';

describe('@afterimage/ffmpeg-compiler', () => {
  const project = parseProject(fixtureProject);

  it('builds a deterministic analysis plan snapshot', () => {
    const plan = buildAnalysisPlan(project, {
      sourceId: 'source-alpha',
      probeOutputPath: 'artifacts/source-alpha.ffprobe.json',
      analysisOutputPath: 'artifacts/source-alpha.analysis.json'
    });

    expect(plan).toMatchInlineSnapshot(`
      {
        "artifacts": {
          "analysisOutputPath": "artifacts/source-alpha.analysis.json",
          "probeOutputPath": "artifacts/source-alpha.ffprobe.json",
        },
        "commands": [
          {
            "args": [
              "-v",
              "error",
              "-print_format",
              "json",
              "-show_format",
              "-show_streams",
              "fixtures/clips/source-alpha.mp4",
            ],
            "binary": "ffprobe",
            "expectedOutputs": [
              "artifacts/source-alpha.ffprobe.json",
            ],
            "label": "probe:source-alpha",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/clips/source-alpha.mp4",
              "-filter:v",
              "select='gt(scene,0.400)',metadata=print:file=-",
              "-an",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              "artifacts/source-alpha.analysis.json",
            ],
            "label": "scene-detect:source-alpha",
          },
        ],
        "projectId": "project-core-engine-fixture",
        "sceneThreshold": 0.4,
        "sourceId": "source-alpha",
      }
    `);
  });

  it('builds a deterministic render plan snapshot', () => {
    const plan = buildRenderPlan(project, {
      outputPath: 'renders/core-engine-fixture.mp4',
      profile: {
        width: 1280,
        height: 720,
        frameRate: 30,
        container: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac'
      }
    });

    expect(plan).toMatchInlineSnapshot(`
      {
        "command": {
          "args": [
            "-y",
            "-i",
            "fixtures/clips/source-alpha.mp4",
            "-filter_complex",
            "[0:v]trim=start=0.500:duration=2.500,setpts=PTS-STARTPTS,gblur=sigma=0.900,eq=saturation=0.938[v0];[0:a]atrim=start=0.500:duration=2.500,asetpts=PTS-STARTPTS[a0];[v0][a0]concat=n=1:v=1:a=1[vconcat][aconcat];[vconcat]fps=30.000,scale=1280:720,format=yuv420p[vout]",
            "-map",
            "[vout]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-map",
            "[aconcat]",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-f",
            "mp4",
            "renders/core-engine-fixture.mp4",
          ],
          "binary": "ffmpeg",
          "expectedOutputs": [
            "renders/core-engine-fixture.mp4",
          ],
          "label": "render:project-core-engine-fixture",
        },
        "outputPath": "renders/core-engine-fixture.mp4",
        "projectId": "project-core-engine-fixture",
        "sequenceId": "sequence-main",
      }
    `);
  });

  it('resolves ffmpeg binaries from env override and PATH fallback', () => {
    const fakeBinDir = mkdtempSync(join(tmpdir(), 'afterimage-ffmpeg-'));
    const ffmpegPath = join(fakeBinDir, 'ffmpeg');
    const ffprobePath = join(fakeBinDir, 'ffprobe');

    writeFileSync(ffmpegPath, '#!/bin/sh\nexit 0\n', 'utf8');
    writeFileSync(ffprobePath, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(ffmpegPath, 0o755);
    chmodSync(ffprobePath, 0o755);

    const envResolved = resolveFfmpegTools({
      env: {
        PATH: '',
        AFTERIMAGE_FFMPEG_PATH: '/custom/ffmpeg',
        AFTERIMAGE_FFPROBE_PATH: '/custom/ffprobe'
      }
    });

    expect(envResolved.ffmpeg.path).toBe('/custom/ffmpeg');
    expect(envResolved.ffprobe.path).toBe('/custom/ffprobe');

    const pathResolved = resolveFfmpegTools({
      env: {
        PATH: fakeBinDir
      }
    });

    expect(pathResolved.ffmpeg.path).toBe(ffmpegPath);
    expect(pathResolved.ffprobe.path).toBe(ffprobePath);
  });

  it('executes command specs through an injected runner', async () => {
    const result = await executeCommandSpec(
      {
        label: 'mock-command',
        binary: 'ffmpeg',
        args: ['-version']
      },
      {
        runner: async (binary, args): Promise<CommandExecutionResult> => ({
          exitCode: binary === 'ffmpeg' && args[0] === '-version' ? 0 : 1,
          stdout: 'ffmpeg version n6.1',
          stderr: ''
        })
      }
    );

    expect(result.stdout).toContain('ffmpeg version');
  });
});
