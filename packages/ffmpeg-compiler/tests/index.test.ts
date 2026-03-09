import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getExportProfileById } from '../../export-profiles/src';
import { fixtureProject } from '../../test-fixtures/src';
import { parseProject } from '../../schema-validators/src';
import {
  buildAnalysisPlan,
  buildAudioChangeAnalysisPlan,
  buildExportPlan,
  buildPreviewPlan,
  buildThumbnailPlan,
  buildWaveformPlan,
  executeCommandSpec,
  getToolchainHealth,
  resolveFfmpegTools,
  type CommandExecutionResult
} from '../src';

describe('@afterimage/ffmpeg-compiler', () => {
  const project = parseProject(fixtureProject);

  it('builds deterministic analysis, thumbnail, waveform, preview, and export plans', () => {
    expect(buildAnalysisPlan(project, {
      assetId: 'asset-alpha',
      probeOutputPath: 'artifacts/source-alpha.ffprobe.json',
      analysisOutputPath: 'artifacts/source-alpha.analysis.log'
    })).toMatchInlineSnapshot(`
      {
        "artifacts": {
          "analysisOutputPath": "artifacts/source-alpha.analysis.log",
          "probeOutputPath": "artifacts/source-alpha.ffprobe.json",
        },
        "assetId": "asset-alpha",
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
            "label": "probe:asset-alpha",
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
              "artifacts/source-alpha.analysis.log",
            ],
            "label": "scene-detect:asset-alpha",
          },
        ],
        "projectId": "project-core-engine-fixture",
        "sceneThreshold": 0.4,
      }
    `);

    expect(buildThumbnailPlan(project, {
      assetId: 'asset-alpha',
      outputPattern: '.afterimage/thumbnails/source-alpha-%03d.jpg',
      manifestOutputPath: '.afterimage/analysis/source-alpha.thumbnails.json'
    }).command.args).toContain('.afterimage/thumbnails/source-alpha-%03d.jpg');

    expect(buildWaveformPlan(project, {
      assetId: 'asset-music',
      outputPath: '.afterimage/waveforms/asset-music.png'
    }).command.args).toContain('.afterimage/waveforms/asset-music.png');

    expect(buildAudioChangeAnalysisPlan(project, {
      assetId: 'asset-music',
      astatsOutputPath: '.afterimage/analysis/asset-music.astats.log',
      aspectralstatsOutputPath: '.afterimage/analysis/asset-music.aspectralstats.log',
      ebur128OutputPath: '.afterimage/analysis/asset-music.ebur128.log',
      silencedetectOutputPath: '.afterimage/analysis/asset-music.silencedetect.log'
    })).toMatchInlineSnapshot(`
      {
        "artifacts": {
          "aspectralstatsOutputPath": ".afterimage/analysis/asset-music.aspectralstats.log",
          "astatsOutputPath": ".afterimage/analysis/asset-music.astats.log",
          "ebur128OutputPath": ".afterimage/analysis/asset-music.ebur128.log",
          "silencedetectOutputPath": ".afterimage/analysis/asset-music.silencedetect.log",
        },
        "assetId": "asset-music",
        "commands": [
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "astats=metadata=1:reset=1,ametadata=print:file=-",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.astats.log",
            ],
            "label": "audio-change:astats:asset-music",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "aspectralstats=win_size=2048:overlap=0.5,ametadata=print:file=-",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.aspectralstats.log",
            ],
            "label": "audio-change:aspectralstats:asset-music",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "ebur128=metadata=1,ametadata=print:file=-",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.ebur128.log",
            ],
            "label": "audio-change:ebur128:asset-music",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "silencedetect=noise=-40dB:d=0.4",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.silencedetect.log",
            ],
            "label": "audio-change:silencedetect:asset-music",
          },
        ],
        "projectId": "project-core-engine-fixture",
      }
    `);

    expect(buildPreviewPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }).command.args).toContain('.afterimage/preview/variant-main.mp4');

    expect(buildExportPlan(project, {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    })).toMatchInlineSnapshot(`
      {
        "command": {
          "args": [
            "-y",
            "-i",
            "fixtures/clips/source-alpha.mp4",
            "-i",
            "fixtures/audio/score-alpha.wav",
            "-filter_complex",
            "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.072,gblur=sigma=0.900,eq=saturation=0.938,fps=30.000,scale=1920:1080,setsar=1,format=yuv422p10le[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]format=yuv422p10le[vout];[1:a]atrim=start=0:duration=2.000,asetpts=PTS-STARTPTS[amusic]",
            "-map",
            "[vout]",
            "-c:v",
            "prores_ks",
            "-profile:v",
            "3",
            "-map",
            "[amusic]",
            "-c:a",
            "pcm_s24le",
            "-f",
            "mov",
            "exports/studio-fixture.mov",
          ],
          "binary": "ffmpeg",
          "expectedOutputs": [
            "exports/studio-fixture.mov",
          ],
          "label": "render:project-core-engine-fixture:variant-main",
        },
        "outputPath": "exports/studio-fixture.mov",
        "projectId": "project-core-engine-fixture",
        "sequenceId": "sequence-main",
        "variantId": "variant-main",
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

  it('executes command specs and probes toolchain health through injected runners', async () => {
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

    const health = await getToolchainHealth({
      ffmpeg: {
        path: '/custom/ffmpeg',
        source: 'env',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test'
        }
      },
      ffprobe: {
        path: '/custom/ffprobe',
        source: 'env',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test'
        }
      }
    }, {
      runner: async (binary): Promise<CommandExecutionResult> => ({
        exitCode: 0,
        stdout: `${binary} version test`,
        stderr: ''
      })
    });

    expect(health.available).toBe(true);
    expect(health.versions.ffmpeg.versionLine).toContain('/custom/ffmpeg version test');
  });
});
