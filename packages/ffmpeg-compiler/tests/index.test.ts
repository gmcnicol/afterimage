import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getExportProfileById } from '../../export-profiles/src';
import { fixtureProject } from '../../test-fixtures/src';
import { parseProject } from '../../schema-validators/src';
import type { FilterInstance, ProjectFile, SupportedFilterType } from '../../project-model/src';
import {
  buildAnalysisPlan,
  buildAudioChangeAnalysisPlan,
  buildExportPlan,
  buildExportRenderGraphPlan,
  buildFinalizeRenderPlan,
  buildPreviewPlan,
  buildPreviewRenderGraphPlan,
  buildRenderGraphPlan,
  buildRenderPlan,
  buildThumbnailPlan,
  buildWaveformPlan,
  executeCommandSpec,
  getToolchainHealth,
  resolveFfmpegTools,
  type CommandExecutionResult,
  type RenderGraphArtifact,
  type RenderGraphBackendRequirement,
  type RenderGraphCacheIdentity,
  type RenderGraphCapabilityDiagnostic,
  type RenderGraphEdge,
  type RenderGraphNode,
  type RenderGraphPass,
  type RenderGraphPlan,
  type ResolvedFfmpegTools
} from '../src';

describe('@afterimage/ffmpeg-compiler', () => {
  const project = parseProject(fixtureProject);

  function withoutCaptureReplayReferences(projectFile: ProjectFile): ProjectFile {
    return {
      ...projectFile,
      composition: projectFile.composition
        ? {
            ...projectFile.composition,
            modulationRoutes: [],
            entropyStates: []
          }
        : undefined,
      captureLogs: []
    };
  }

  function summarizeRenderGraphPlan(plan: RenderGraphPlan) {
    const pass = plan.passes[0];
    return {
      identity: plan.identity,
      target: plan.target,
      inputs: plan.inputs,
      nodes: plan.nodes.map((node) => ({
        id: node.id,
        kind: node.kind
      })),
      edges: plan.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        metadata: edge.metadata
      })),
      pass: {
        id: pass.id,
        backend: pass.backend,
        nodeId: pass.nodeId,
        inputNodeIds: pass.inputNodeIds,
        outputArtifactIds: pass.outputArtifactIds,
        command: pass.command,
        semantics: pass.semantics,
        cacheKey: pass.cacheIdentity.key
      },
      artifacts: plan.artifacts.map((artifact) => ({
        id: artifact.id,
        role: artifact.role,
        path: artifact.path,
        producedBy: artifact.producedBy,
        cacheKey: artifact.cacheIdentity.key
      })),
      backendRequirements: plan.backendRequirements.map((requirement) => ({
        id: requirement.id,
        backend: requirement.backend,
        binary: requirement.binary,
        capabilities: requirement.capabilities
      })),
      diagnostics: plan.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        nodeId: diagnostic.nodeId,
        passId: diagnostic.passId,
        requirementId: diagnostic.requirementId
      })),
      cacheKey: plan.cacheIdentity.key
    };
  }

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
            "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.440,eq=contrast=1.020:brightness=0.020:saturation=1.013,gblur=sigma=2.150,chromashift=cbh=3:crh=-3:edge=smear,eq=saturation=1.030,fps=30.000,scale=1920:1080,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
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

  it('exposes serializable render graph contract shapes', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const node: RenderGraphNode = plan.nodes[0];
    const edge: RenderGraphEdge = plan.edges[0];
    const pass: RenderGraphPass = plan.passes[0];
    const artifact: RenderGraphArtifact = plan.artifacts[0];
    const requirement: RenderGraphBackendRequirement = plan.backendRequirements[0];
    const diagnostic: RenderGraphCapabilityDiagnostic = plan.diagnostics[0];
    const cacheIdentity: RenderGraphCacheIdentity = plan.cacheIdentity;

    expect(node.kind).toBe('project');
    expect(edge.kind).toBe('identity');
    expect(pass.backend).toBe('ffmpeg');
    expect(pass.command.args).toContain('.afterimage/preview/variant-main.mp4');
    expect(artifact.role).toBe('preview-output');
    expect(requirement.capabilities).toEqual(expect.arrayContaining([
      'filter_complex',
      'video-codec:libx264',
      'audio-codec:aac',
      'container:mp4'
    ]));
    expect(diagnostic.severity).toBe('info');
    expect(cacheIdentity).toEqual(expect.objectContaining({
      namespace: 'render-graph-plan',
      version: 1,
      algorithm: 'sha256',
      status: 'derived'
    }));
    expect(cacheIdentity.invalidatesOn).toEqual(expect.arrayContaining(['project-state', 'ffmpeg-toolchain']));
    expect(pass.provenance.parentCacheKeys).toContain(cacheIdentity.key);
    expect(artifact.provenance.parentCacheKeys).toContain(pass.cacheIdentity.key);
  });

  it('keeps render pass cache identities reusable across output paths while deriving artifact identities from the path', () => {
    const first = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main-a.mp4'
    });
    const second = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main-b.mp4'
    });

    expect(first.cacheIdentity.key).toBe(second.cacheIdentity.key);
    expect(first.passes[0].cacheIdentity.key).toBe(second.passes[0].cacheIdentity.key);
    expect(first.artifacts[0].id).not.toBe(second.artifacts[0].id);
    expect(first.artifacts[0].cacheIdentity.key).not.toBe(second.artifacts[0].cacheIdentity.key);
  });

  it('changes derived cache identities when project content, profile, capture, archive, or toolchain inputs change', () => {
    const baseRequest = {
      outputPath: '.afterimage/preview/variant-main.mp4'
    };
    const baseKey = buildPreviewRenderGraphPlan(project, baseRequest).passes[0].cacheIdentity.key;
    const changedContentKey = buildPreviewRenderGraphPlan(parseProject({
      ...fixtureProject,
      variants: fixtureProject.variants.map((variant) => variant.id === 'variant-main'
        ? {
            ...variant,
            clips: variant.clips.map((clip, index) => index === 0 ? { ...clip, durationMs: clip.durationMs + 1 } : clip)
          }
        : variant)
    }), baseRequest).passes[0].cacheIdentity.key;
    const changedProfileKey = buildPreviewRenderGraphPlan(project, {
      ...baseRequest,
      width: 1280
    }).passes[0].cacheIdentity.key;
    const changedCaptureKey = buildPreviewRenderGraphPlan(parseProject({
      ...fixtureProject,
      captureLogs: fixtureProject.captureLogs?.map((log) => ({
        ...log,
        events: log.events.map((event) => event.id === 'capture-event-1'
          ? { ...event, captureTimeMs: event.captureTimeMs + 1, compositionTimeMs: (event.compositionTimeMs ?? event.captureTimeMs) + 1 }
          : event)
      }))
    }), baseRequest).passes[0].cacheIdentity.key;
    const changedArchiveKey = buildPreviewRenderGraphPlan(parseProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        acceptedArchiveReferences: fixtureProject.composition.acceptedArchiveReferences?.map((reference) => ({
          ...reference,
          note: `${reference.note} Updated.`
        }))
      }
    }), baseRequest).passes[0].cacheIdentity.key;
    const changedTools: ResolvedFfmpegTools = {
      ffmpeg: {
        path: '/opt/afterimage/ffmpeg',
        source: 'env',
        envVar: 'AFTERIMAGE_FFMPEG_PATH',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test ffmpeg'
        }
      },
      ffprobe: {
        path: '/opt/afterimage/ffprobe',
        source: 'env',
        envVar: 'AFTERIMAGE_FFPROBE_PATH',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test ffprobe'
        }
      }
    };
    const changedToolchainKey = buildPreviewRenderGraphPlan(project, baseRequest, changedTools).passes[0].cacheIdentity.key;

    expect(changedContentKey).not.toBe(baseKey);
    expect(changedProfileKey).not.toBe(baseKey);
    expect(changedCaptureKey).not.toBe(baseKey);
    expect(changedArchiveKey).not.toBe(baseKey);
    expect(changedToolchainKey).not.toBe(baseKey);
  });

  it('routes public render command planners through FFmpeg render graph passes', () => {
    const previewRequest = {
      outputPath: '.afterimage/preview/variant-main.mp4'
    };
    const exportRequest = {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    };
    const renderRequest = {
      outputPath: 'exports/studio-fixture-render.mov',
      profile: getExportProfileById('landscape-master')
    };

    expect(buildPreviewPlan(project, previewRequest).command)
      .toEqual(buildPreviewRenderGraphPlan(project, previewRequest).passes[0].command);
    expect(buildExportPlan(project, exportRequest).command)
      .toEqual(buildExportRenderGraphPlan(project, exportRequest).passes[0].command);
    expect(buildRenderPlan(project, renderRequest).command)
      .toEqual(buildRenderGraphPlan(project, renderRequest, renderRequest.profile, 'render').passes[0].command);
  });

  it('builds a deterministic canonical preview render graph plan', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });

    expect(summarizeRenderGraphPlan(plan)).toMatchInlineSnapshot(`
      {
        "artifacts": [
          {
            "cacheKey": "9c88ef2665fb76643a9b5f8bb7bd5c85d63f599a236e56e7c2a4d5289d1ba709",
            "id": "artifact:preview-output:c30c5dd1d95011925d2ae3fd0afb0fcec6a85b2a55224e4a247f71220cbda8da",
            "path": ".afterimage/preview/variant-main.mp4",
            "producedBy": "pass:ffmpeg-render",
            "role": "preview-output",
          },
        ],
        "backendRequirements": [
          {
            "backend": "ffmpeg",
            "binary": "ffmpeg",
            "capabilities": [
              "filter_complex",
              "video-codec:libx264",
              "audio-codec:aac",
              "container:mp4",
              "pixel-format:yuv420p",
            ],
            "id": "requirement:ffmpeg-render",
          },
        ],
        "cacheKey": "4b1c106856f211f60c258a30dcd49f0e92e52aa25a0702b64e53cd815fd7a6c9",
        "diagnostics": [
          {
            "code": "FFMPEG_PASS_COMPATIBILITY",
            "nodeId": "operation:preview:variant-main",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:ffmpeg-render",
            "severity": "info",
          },
        ],
        "edges": [
          {
            "from": "project:project-core-engine-fixture",
            "kind": "identity",
            "metadata": undefined,
            "to": "sequence:sequence-main",
          },
          {
            "from": "sequence:sequence-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "variant:variant-main",
          },
          {
            "from": "variant:variant-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "operation:preview:variant-main",
          },
          {
            "from": "input:asset-alpha",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 0,
              "loop": false,
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "input:asset-music",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 1,
              "loop": false,
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "operation:preview:variant-main",
            "kind": "artifact-output",
            "metadata": undefined,
            "to": "artifact:preview-output:c30c5dd1d95011925d2ae3fd0afb0fcec6a85b2a55224e4a247f71220cbda8da",
          },
        ],
        "identity": {
          "mode": "preview",
          "planId": "render-graph:preview:project-core-engine-fixture:sequence-main:variant-main:4b1c106856f211f60c258a30dcd49f0e92e52aa25a0702b64e53cd815fd7a6c9",
          "projectId": "project-core-engine-fixture",
          "schemaVersion": 1,
          "sequenceId": "sequence-main",
          "variantId": "variant-main",
        },
        "inputs": [
          {
            "assetId": "asset-alpha",
            "id": "input:asset-alpha",
            "inputIndex": 0,
            "loop": false,
            "mediaType": "video",
            "path": "fixtures/clips/source-alpha.mp4",
            "role": "source",
          },
          {
            "assetId": "asset-music",
            "id": "input:asset-music",
            "inputIndex": 1,
            "loop": false,
            "mediaType": "audio",
            "path": "fixtures/audio/score-alpha.wav",
            "role": "music",
          },
        ],
        "nodes": [
          {
            "id": "project:project-core-engine-fixture",
            "kind": "project",
          },
          {
            "id": "sequence:sequence-main",
            "kind": "sequence",
          },
          {
            "id": "variant:variant-main",
            "kind": "variant",
          },
          {
            "id": "input:asset-alpha",
            "kind": "input",
          },
          {
            "id": "input:asset-music",
            "kind": "input",
          },
          {
            "id": "operation:preview:variant-main",
            "kind": "operation",
          },
          {
            "id": "artifact:preview-output:c30c5dd1d95011925d2ae3fd0afb0fcec6a85b2a55224e4a247f71220cbda8da",
            "kind": "artifact",
          },
        ],
        "pass": {
          "backend": "ffmpeg",
          "cacheKey": "48d2f1c447cf87da08a269ae08f427024c0fb068cec52e3db29861c3293f699f",
          "command": {
            "args": [
              "-y",
              "-i",
              "fixtures/clips/source-alpha.mp4",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-filter_complex",
              "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.440,eq=contrast=1.020:brightness=0.020:saturation=1.013,gblur=sigma=2.150,chromashift=cbh=3:crh=-3:edge=smear,eq=saturation=1.030,fps=24.000,scale=960:540,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
              "-map",
              "[vout]",
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "26",
              "-map",
              "[amusic]",
              "-c:a",
              "aac",
              "-b:a",
              "128k",
              "-f",
              "mp4",
              ".afterimage/preview/variant-main.mp4",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/preview/variant-main.mp4",
            ],
            "label": "render:project-core-engine-fixture:variant-main",
          },
          "id": "pass:ffmpeg-render",
          "inputNodeIds": [
            "input:asset-alpha",
            "input:asset-music",
          ],
          "nodeId": "operation:preview:variant-main",
          "outputArtifactIds": [
            "artifact:preview-output:c30c5dd1d95011925d2ae3fd0afb0fcec6a85b2a55224e4a247f71220cbda8da",
          ],
          "semantics": {
            "chunkedExportRecommended": false,
            "durationMs": 5000,
            "operation": "preview",
            "profile": {
              "audioBitrateKbps": 128,
              "audioCodec": "aac",
              "container": "mp4",
              "crf": 26,
              "frameRate": 24,
              "height": 540,
              "pixelFormat": "yuv420p",
              "videoCodec": "libx264",
              "videoPreset": "fast",
              "width": 960,
            },
            "usesMaskTransitions": false,
          },
        },
        "target": {
          "durationMs": 5000,
          "outputPath": ".afterimage/preview/variant-main.mp4",
          "profile": {
            "audioBitrateKbps": 128,
            "audioCodec": "aac",
            "container": "mp4",
            "crf": 26,
            "frameRate": 24,
            "height": 540,
            "pixelFormat": "yuv420p",
            "videoCodec": "libx264",
            "videoPreset": "fast",
            "width": 960,
          },
        },
      }
    `);
  });

  it('builds a deterministic canonical export render graph plan', () => {
    const plan = buildExportRenderGraphPlan(project, {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    });

    expect(summarizeRenderGraphPlan(plan)).toMatchInlineSnapshot(`
      {
        "artifacts": [
          {
            "cacheKey": "e261ac848317a8987ddf32a5d1d627a260a5f3a1a7953a5829d7ffa248b272f7",
            "id": "artifact:export-output:a74df82ea909ca1f834ffdb619b031465ae3d1e35d381678852533184d3585e6",
            "path": "exports/studio-fixture.mov",
            "producedBy": "pass:ffmpeg-render",
            "role": "export-output",
          },
        ],
        "backendRequirements": [
          {
            "backend": "ffmpeg",
            "binary": "ffmpeg",
            "capabilities": [
              "filter_complex",
              "video-codec:libx264",
              "audio-codec:aac",
              "container:mp4",
              "pixel-format:yuv420p",
            ],
            "id": "requirement:ffmpeg-render",
          },
        ],
        "cacheKey": "cfef8c914816ee80cfe84839913b26cc4f17725b6d79f016751c6c4f38837818",
        "diagnostics": [
          {
            "code": "FFMPEG_PASS_COMPATIBILITY",
            "nodeId": "operation:export:variant-main",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:ffmpeg-render",
            "severity": "info",
          },
        ],
        "edges": [
          {
            "from": "project:project-core-engine-fixture",
            "kind": "identity",
            "metadata": undefined,
            "to": "sequence:sequence-main",
          },
          {
            "from": "sequence:sequence-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "variant:variant-main",
          },
          {
            "from": "variant:variant-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "operation:export:variant-main",
          },
          {
            "from": "input:asset-alpha",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 0,
              "loop": false,
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "input:asset-music",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 1,
              "loop": false,
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "operation:export:variant-main",
            "kind": "artifact-output",
            "metadata": undefined,
            "to": "artifact:export-output:a74df82ea909ca1f834ffdb619b031465ae3d1e35d381678852533184d3585e6",
          },
        ],
        "identity": {
          "mode": "export",
          "planId": "render-graph:export:project-core-engine-fixture:sequence-main:variant-main:cfef8c914816ee80cfe84839913b26cc4f17725b6d79f016751c6c4f38837818",
          "projectId": "project-core-engine-fixture",
          "schemaVersion": 1,
          "sequenceId": "sequence-main",
          "variantId": "variant-main",
        },
        "inputs": [
          {
            "assetId": "asset-alpha",
            "id": "input:asset-alpha",
            "inputIndex": 0,
            "loop": false,
            "mediaType": "video",
            "path": "fixtures/clips/source-alpha.mp4",
            "role": "source",
          },
          {
            "assetId": "asset-music",
            "id": "input:asset-music",
            "inputIndex": 1,
            "loop": false,
            "mediaType": "audio",
            "path": "fixtures/audio/score-alpha.wav",
            "role": "music",
          },
        ],
        "nodes": [
          {
            "id": "project:project-core-engine-fixture",
            "kind": "project",
          },
          {
            "id": "sequence:sequence-main",
            "kind": "sequence",
          },
          {
            "id": "variant:variant-main",
            "kind": "variant",
          },
          {
            "id": "input:asset-alpha",
            "kind": "input",
          },
          {
            "id": "input:asset-music",
            "kind": "input",
          },
          {
            "id": "operation:export:variant-main",
            "kind": "operation",
          },
          {
            "id": "artifact:export-output:a74df82ea909ca1f834ffdb619b031465ae3d1e35d381678852533184d3585e6",
            "kind": "artifact",
          },
        ],
        "pass": {
          "backend": "ffmpeg",
          "cacheKey": "7e5ef4ebae56ced07e9a283fe7456226acb096b1ed7fd4e826fc05c6f06c8935",
          "command": {
            "args": [
              "-y",
              "-i",
              "fixtures/clips/source-alpha.mp4",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-filter_complex",
              "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.440,eq=contrast=1.020:brightness=0.020:saturation=1.013,gblur=sigma=2.150,chromashift=cbh=3:crh=-3:edge=smear,eq=saturation=1.030,fps=30.000,scale=1920:1080,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
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
          "id": "pass:ffmpeg-render",
          "inputNodeIds": [
            "input:asset-alpha",
            "input:asset-music",
          ],
          "nodeId": "operation:export:variant-main",
          "outputArtifactIds": [
            "artifact:export-output:a74df82ea909ca1f834ffdb619b031465ae3d1e35d381678852533184d3585e6",
          ],
          "semantics": {
            "chunkedExportRecommended": false,
            "durationMs": 5000,
            "operation": "export",
            "profile": {
              "audioBitrateKbps": 256,
              "audioCodec": "aac",
              "container": "mp4",
              "crf": 18,
              "frameRate": 30,
              "height": 1080,
              "pixelFormat": "yuv420p",
              "videoBufsizeKbps": 24000,
              "videoCodec": "libx264",
              "videoMaxrateKbps": 12000,
              "videoPreset": "medium",
              "width": 1920,
            },
            "usesMaskTransitions": false,
          },
        },
        "target": {
          "durationMs": 5000,
          "outputPath": "exports/studio-fixture.mov",
          "profile": {
            "audioBitrateKbps": 256,
            "audioCodec": "aac",
            "container": "mp4",
            "crf": 18,
            "frameRate": 30,
            "height": 1080,
            "pixelFormat": "yuv420p",
            "videoBufsizeKbps": 24000,
            "videoCodec": "libx264",
            "videoMaxrateKbps": 12000,
            "videoPreset": "medium",
            "width": 1920,
          },
        },
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
    expect(plan.command.args.join(' ')).toContain('gblur=sigma=2.350,eq=contrast=1.042:brightness=0.042:saturation=1.028');
    expect(plan.command.args.join(' ')).toContain('gblur=sigma=4.350,eq=contrast=1.090:brightness=0.090:saturation=1.060');
    expect(plan.command.args.join(' ')).toContain('fade=t=out:st=3.000:d=2.000');
  });

  it('compiles signal breakup as visible temporal noise', () => {
    const plan = buildPreviewPlan(parseProject(withoutCaptureReplayReferences({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [
            {
              id: 'filter-signal-breakup',
              type: 'glitch-bands',
              enabled: true,
              orderIndex: 0,
              parameters: {
                strength: 1
              },
              mix: 1
            }
          ]
        }
      ],
      automationLanes: []
    })), {
      outputPath: '.afterimage/preview/variant-signal-breakup.mp4'
    });

    expect(plan.command.args.join(' ')).toContain('noise=alls=100.0:allf=t+u,tblend=all_mode=difference:all_opacity=0.300');
  });

  it.each([
    ['contrast', { contrast: 1 }, 'eq=contrast=2.000'],
    ['brightness', { brightness: 1 }, 'eq=brightness=0.250'],
    ['blur', { radius: 1 }, 'gblur=sigma=5.400'],
    ['bloom-soft', { strength: 1 }, 'gblur=sigma=5.600,eq=contrast=1.120:brightness=0.120:saturation=1.080'],
    ['glitch-bands', { strength: 1 }, 'noise=alls=100.0:allf=t+u,tblend=all_mode=difference:all_opacity=0.300'],
    ['chroma-bleed', { strength: 1 }, 'chromashift=cbh=12:crh=-12:edge=smear,eq=saturation=1.120']
  ] satisfies [SupportedFilterType, Record<string, number>, string][])('compiles %s into an active video filter', (type, parameters, expectedExpression) => {
    const filter: FilterInstance = {
      id: `filter-${type}`,
      type,
      enabled: true,
      orderIndex: 0,
      parameters,
      mix: 1
    };
    const plan = buildPreviewPlan(parseProject(withoutCaptureReplayReferences({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [filter]
        }
      ],
      automationLanes: []
    })), {
      outputPath: `.afterimage/preview/variant-${type}.mp4`
    });

    expect(plan.command.args.join(' ')).toContain(expectedExpression);
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
    });

    expect(exportArgs).toEqual(expect.arrayContaining(['-maxrate', '12000k', '-bufsize', '24000k']));
    expect(finalizeArgs.command.args).toEqual(expect.arrayContaining(['-maxrate', '12000k', '-bufsize', '24000k']));
    expect(finalizeArgs.outputPath).toBe('exports/studio-fixture.mp4');
    expect(finalizeArgs.cacheIdentity.status).toBe('derived');
    expect(finalizeArgs.cacheIdentity.invalidatesOn).toEqual(expect.arrayContaining(['concat-list', 'ffmpeg-toolchain']));
    expect(finalizeArgs.artifact.role).toBe('finalize-output');
    expect(finalizeArgs.artifact.path).toBe('exports/studio-fixture.mp4');
    expect(finalizeArgs.artifact.provenance.parentCacheKeys).toContain(finalizeArgs.cacheIdentity.key);
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
