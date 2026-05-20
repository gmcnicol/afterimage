import type { NormalizedProjectFile, ProjectFile } from '@afterimage/project-model';
import type {
  AnalysisPlan,
  AnalysisRequest,
  AudioChangeAnalysisPlan,
  AudioChangeAnalysisRequest,
  CommandSpec,
  ResolvedFfmpegTools,
  ThumbnailPlan,
  ThumbnailRequest,
  WaveformPlan,
  WaveformRequest
} from './types.js';
import { DEFAULT_SCENE_THRESHOLD, ensureAsset, formatDecimal, makePlanningTools, normalizeForPlanning } from './utils.js';

export function buildAnalysisPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: AnalysisRequest,
  tools?: ResolvedFfmpegTools
): AnalysisPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const sceneThreshold = request.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
  const resolvedTools = makePlanningTools(tools);

  const ffprobeCommand: CommandSpec = {
    label: `probe:${request.assetId}`,
    binary: resolvedTools.ffprobe.path,
    args: [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      asset.path.absolutePath
    ],
    expectedOutputs: [request.probeOutputPath]
  };

  const ffmpegCommand: CommandSpec = {
    label: `scene-detect:${request.assetId}`,
    binary: resolvedTools.ffmpeg.path,
    args: [
      '-hide_banner',
      '-loglevel', 'info',
      request.overwrite === false ? '-n' : '-y',
      '-i', asset.path.absolutePath,
      '-filter:v', `select='gt(scene,${formatDecimal(sceneThreshold)})',metadata=print:file=-`,
      '-an',
      '-f', 'null',
      '-'
    ],
    expectedOutputs: [request.analysisOutputPath]
  };

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    sceneThreshold,
    artifacts: {
      probeOutputPath: request.probeOutputPath,
      analysisOutputPath: request.analysisOutputPath
    },
    commands: [ffprobeCommand, ffmpegCommand]
  };
}

export function buildThumbnailPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ThumbnailRequest,
  tools?: ResolvedFfmpegTools
): ThumbnailPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const resolvedTools = makePlanningTools(tools);

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    manifestOutputPath: request.manifestOutputPath,
    command: {
      label: `thumbnails:${request.assetId}`,
      binary: resolvedTools.ffmpeg.path,
      args: [
        request.overwrite === false ? '-n' : '-y',
        '-i', asset.path.absolutePath,
        '-vf', `fps=1,scale=${request.width ?? 640}:-1`,
        '-q:v', '4',
        request.outputPattern
      ],
      expectedOutputs: [request.manifestOutputPath]
    }
  };
}

export function buildAudioChangeAnalysisPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: AudioChangeAnalysisRequest,
  tools?: ResolvedFfmpegTools
): AudioChangeAnalysisPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const resolvedTools = makePlanningTools(tools);
  const overwriteFlag = request.overwrite === false ? '-n' : '-y';

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    artifacts: {
      astatsOutputPath: request.astatsOutputPath,
      aspectralstatsOutputPath: request.aspectralstatsOutputPath,
      ebur128OutputPath: request.ebur128OutputPath,
      silencedetectOutputPath: request.silencedetectOutputPath
    },
    commands: [
      {
        label: `audio-change:astats:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'astats=metadata=1:reset=1,ametadata=print:file=-',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.astatsOutputPath]
      },
      {
        label: `audio-change:aspectralstats:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'aspectralstats=win_size=2048:overlap=0.5,ametadata=print:file=-',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.aspectralstatsOutputPath]
      },
      {
        label: `audio-change:ebur128:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'ebur128=metadata=1,ametadata=print:file=-',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.ebur128OutputPath]
      },
      {
        label: `audio-change:silencedetect:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'silencedetect=noise=-40dB:d=0.4',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.silencedetectOutputPath]
      }
    ]
  };
}

export function buildWaveformPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: WaveformRequest,
  tools?: ResolvedFfmpegTools
): WaveformPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const resolvedTools = makePlanningTools(tools);

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    command: {
      label: `waveform:${request.assetId}`,
      binary: resolvedTools.ffmpeg.path,
      args: [
        request.overwrite === false ? '-n' : '-y',
        '-i', asset.path.absolutePath,
        '-filter_complex', `aformat=channel_layouts=stereo,showwavespic=s=${request.width ?? 960}x${request.height ?? 240}`,
        '-frames:v', '1',
        request.outputPath
      ],
      expectedOutputs: [request.outputPath]
    }
  };
}
