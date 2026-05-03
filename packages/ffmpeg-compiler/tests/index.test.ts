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
  buildFinalizeRenderPlan,
  buildPreviewPlan,
  buildRenderPlan,
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
            "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.072,gblur=sigma=2.150,eq=saturation=0.938,fps=30.000,scale=1920:1080,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
            "-map",
            "[vout]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-maxrate",
            "12000k",
            "-bufsize",
            "24000k",
            "-map",
            "[amusic]",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-f",
            "mp4",
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

  it('renders automation as deterministic clip segments instead of a midpoint snapshot', () => {
    const plan = buildRenderPlan(parseProject({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [
            {
              id: 'filter-main-bloom',
              type: 'bloom-soft',
              enabled: true,
              orderIndex: 0,
              parameters: {
                strength: 0.2
              },
              mix: 1,
              automationLaneIds: ['lane-bloom-strength']
            }
          ]
        }
      ],
      automationLanes: [
        {
          id: 'lane-bloom-strength',
          name: 'Bloom Strength',
          target: {
            filterId: 'filter-main-bloom',
            property: 'strength'
          },
          enabled: true,
          keyframes: [
            {
              id: 'keyframe-1',
              timeMs: 0,
              value: 0.1
            },
            {
              id: 'keyframe-2',
              timeMs: 1000,
              value: 0.6
            },
            {
              id: 'keyframe-3',
              timeMs: 2000,
              value: 0.9
            }
          ]
        }
      ]
    }), {
      outputPath: 'exports/studio-fixture-automation.mov',
      profile: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        container: 'mov',
        videoCodec: 'prores_ks',
        audioCodec: 'pcm_s24le',
        pixelFormat: 'yuv422p10le'
      }
    });

    expect(plan.command.args).toContain('exports/studio-fixture-automation.mov');
    expect(plan.command.args.join(' ')).toContain('concat=n=2:v=1:a=0[vconcat]');
    expect(plan.command.args.join(' ')).toContain('gblur=sigma=1.800');
    expect(plan.command.args.join(' ')).toContain('gblur=sigma=3.400');
    expect(plan.command.args.join(' ')).toContain('fade=t=out:st=3.000:d=2.000');
  });

  it('builds asset-backed mask transitions with optional overlay assets', () => {
    const plan = buildPreviewPlan(parseProject({
      ...fixtureProject,
      assets: [
        ...fixtureProject.assets,
        {
          id: 'asset-beta',
          filename: 'source-beta.mp4',
          mediaType: 'video',
          path: {
            absolutePath: 'fixtures/clips/source-beta.mp4',
            relativePath: 'clips/source-beta.mp4'
          },
          durationMs: 2000,
          width: 1920,
          height: 1080,
          frameRate: 24,
          hasAudio: true
        },
        {
          id: 'asset-transition-mask',
          filename: 'mask-alpha.mp4',
          mediaType: 'video',
          path: {
            absolutePath: 'fixtures/transitions/mask-alpha.mp4',
            relativePath: 'transitions/mask-alpha.mp4'
          },
          durationMs: 750,
          width: 640,
          height: 360,
          frameRate: 15,
          hasAudio: false
        },
        {
          id: 'asset-transition-overlay',
          filename: 'overlay-alpha.mp4',
          mediaType: 'video',
          path: {
            absolutePath: 'fixtures/transitions/overlay-alpha.mp4',
            relativePath: 'transitions/overlay-alpha.mp4'
          },
          durationMs: 750,
          width: 640,
          height: 360,
          frameRate: 15,
          hasAudio: false
        }
      ],
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: [
            {
              ...fixtureProject.variants[0].clips[0],
              transition: 'mask',
              transitionDurationMs: 500,
              transitionAssetId: 'asset-transition-mask',
              transitionOverlayAssetId: 'asset-transition-overlay'
            },
            {
              id: 'clip-second',
              assetId: 'asset-beta',
              timelineStartMs: 2000,
              sourceStartMs: 0,
              durationMs: 2000,
              transition: 'cut'
            }
          ]
        }
      ]
    }), {
      outputPath: '.afterimage/preview/variant-mask.mp4'
    });

    const command = plan.command.args.join(' ');
    expect(plan.command.args).toContain('fixtures/transitions/mask-alpha.mp4');
    expect(plan.command.args).toContain('fixtures/transitions/overlay-alpha.mp4');
    expect(command).toContain('maskedmerge');
    expect(command).toContain("blend=c0_expr='min(255,A+B*0.28)':c1_expr='A':c2_expr='A'");
    expect(command).toContain('concat=n=3:v=1:a=0[vconcat]');
    expect(command).toContain('tpad=stop_mode=clone:stop_duration=1.500');
    expect(command).toContain('fade=t=out:st=3.000:d=2.000');
    expect(command).toContain('atrim=start=0:duration=5.000');
  });

  it('builds standalone clip overlays independently of transitions', () => {
    const plan = buildPreviewPlan(parseProject({
      ...fixtureProject,
      assets: [
        ...fixtureProject.assets,
        {
          id: 'asset-overlay',
          filename: 'foam-overlay.mp4',
          mediaType: 'video',
          assetRole: 'transition-overlay',
          path: {
            absolutePath: 'fixtures/overlays/foam-overlay.mp4',
            relativePath: 'overlays/foam-overlay.mp4'
          },
          durationMs: 750,
          width: 640,
          height: 360,
          frameRate: 15,
          hasAudio: false
        }
      ],
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: fixtureProject.variants[0].clips.map((clip) => ({
            ...clip,
            overlayAssetId: 'asset-overlay'
          }))
        }
      ]
    }), {
      outputPath: '.afterimage/preview/variant-overlay.mp4'
    });

    const command = plan.command.args.join(' ');
    expect(plan.command.args).toContain('-stream_loop');
    expect(plan.command.args).toContain('fixtures/overlays/foam-overlay.mp4');
    expect(command).toContain("blend=c0_expr='min(255,A+B*0.28)':c1_expr='A':c2_expr='A'");
  });

  it('carries x264 bitrate ceilings through export and chunk finalization plans', () => {
    const profile = getExportProfileById('landscape-master');
    const exportArgs = buildExportPlan(project, {
      outputPath: 'exports/studio-fixture.mp4',
      profile
    }).command.args;
    const finalizeArgs = buildFinalizeRenderPlan({
      concatListPath: '.afterimage/render/chunks.txt',
      outputPath: 'exports/studio-fixture.mp4',
      profile,
      durationMs: 5000
    }).command.args;

    expect(exportArgs).toEqual(expect.arrayContaining(['-maxrate', '12000k', '-bufsize', '24000k']));
    expect(finalizeArgs).toEqual(expect.arrayContaining(['-maxrate', '12000k', '-bufsize', '24000k']));
  });

  it('trims overlay and transition assets from selected cut starts', () => {
    const plan = buildPreviewPlan(parseProject({
      ...fixtureProject,
      assets: [
        ...fixtureProject.assets,
        {
          id: 'asset-mask-cut',
          filename: 'mask-cut.mp4',
          mediaType: 'video',
          assetRole: 'transition-mask',
          path: {
            absolutePath: 'fixtures/transitions/mask-cut.mp4'
          },
          durationMs: 1200,
          hasAudio: false
        },
        {
          id: 'asset-overlay-cut',
          filename: 'overlay-cut.mp4',
          mediaType: 'video',
          assetRole: 'transition-overlay',
          path: {
            absolutePath: 'fixtures/overlays/overlay-cut.mp4'
          },
          durationMs: 1200,
          hasAudio: false
        }
      ],
      cutCandidates: [
        ...(fixtureProject.cutCandidates ?? []),
        { id: 'cut-mask', assetId: 'asset-mask-cut', startMs: 250, endMs: 750, durationMs: 500 },
        { id: 'cut-overlay', assetId: 'asset-overlay-cut', startMs: 125, endMs: 625, durationMs: 500 }
      ],
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: [
            {
              ...fixtureProject.variants[0].clips[0],
              overlayAssetId: 'asset-overlay-cut',
              overlayCutId: 'cut-overlay',
              transition: 'mask',
              transitionDurationMs: 500,
              transitionAssetId: 'asset-mask-cut',
              transitionCutId: 'cut-mask',
              transitionOverlayAssetId: 'asset-overlay-cut',
              transitionOverlayCutId: 'cut-overlay'
            },
            {
              id: 'clip-second',
              assetId: 'asset-alpha',
              cutId: 'cut-push',
              timelineStartMs: 2000,
              sourceStartMs: 2500,
              durationMs: 2000,
              transition: 'cut'
            }
          ]
        }
      ]
    }), {
      outputPath: '.afterimage/preview/variant-overlay-cuts.mp4'
    });

    const command = plan.command.args.join(' ');
    expect(command).toContain('trim=start=0.125:duration=');
    expect(command).toContain('trim=start=0.250:duration=');
  });
});
