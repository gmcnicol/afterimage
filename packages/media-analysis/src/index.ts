import type {
  AnalysisFile,
  AnalysisSummary,
  CutCandidate,
  LumaSummary,
  MotionSummary,
  ProbeMetadata,
  ProbeStream,
  SceneCut,
  ThumbnailReference,
  WaveformSummary
} from '@afterimage/project-model';
import { normalizeAnalysisFile } from '@afterimage/project-model';

interface FfprobeStreamInput {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
  avg_frame_rate?: string;
}

interface FfprobeFormatInput {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStreamInput[];
  format?: FfprobeFormatInput;
}

export interface SceneDetectionParseResult {
  sceneCuts: SceneCut[];
  summary: AnalysisSummary;
}

export interface CutGenerationOptions {
  analysisRefId?: string;
  status?: CutCandidate['status'];
  thumbnailTemplate?: (index: number, timeMs: number) => string | undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDurationMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : 0;
}

function normalizeCodecType(codecType: string | undefined): ProbeStream['codecType'] {
  if (codecType === 'video' || codecType === 'audio' || codecType === 'subtitle' || codecType === 'data') {
    return codecType;
  }

  return 'unknown';
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function parseFfprobeOutput(input: string | FfprobeOutput): ProbeMetadata {
  const parsed = typeof input === 'string' ? JSON.parse(input) as FfprobeOutput : input;

  return {
    formatName: parsed.format?.format_name,
    durationMs: parseDurationMs(parsed.format?.duration),
    bitRate: parseInteger(parsed.format?.bit_rate),
    streams: (parsed.streams ?? []).map((stream) => ({
      codecType: normalizeCodecType(stream.codec_type),
      codecName: stream.codec_name,
      width: stream.width,
      height: stream.height,
      sampleRate: parseInteger(stream.sample_rate),
      channels: stream.channels,
      avgFrameRate: stream.avg_frame_rate
    }))
  };
}

export function parseSceneDetectionOutput(log: string): SceneDetectionParseResult {
  const sceneCuts: SceneCut[] = [];
  let pendingTimeMs: number | undefined;
  const normalizedLog = log.replace(/\\n/g, '\n');

  for (const line of normalizedLog.split(/\r?\n/)) {
    const ptsMatch = line.match(/pts_time:([0-9.]+)/);
    if (ptsMatch) {
      pendingTimeMs = Math.round(Number.parseFloat(ptsMatch[1]) * 1000);
    }

    const scoreMatch = line.match(/lavfi\.scene_score=([0-9.]+)/);
    if (scoreMatch && pendingTimeMs !== undefined) {
      sceneCuts.push({
        timeMs: pendingTimeMs,
        score: Number.parseFloat(scoreMatch[1])
      });
      pendingTimeMs = undefined;
    }
  }

  const normalized = sceneCuts.sort((left, right) => left.timeMs - right.timeMs || left.score - right.score);

  return {
    sceneCuts: normalized,
    summary: {
      sceneCount: normalized.length
    }
  };
}

export function buildThumbnailManifest(assetId: string, sceneCuts: SceneCut[], thumbnailTemplate: (index: number, timeMs: number) => string | undefined): ThumbnailReference[] {
  return sceneCuts.map((sceneCut, index) => ({
    id: `${assetId}-thumbnail-${index + 1}`,
    timeMs: sceneCut.timeMs,
    path: thumbnailTemplate(index, sceneCut.timeMs) ?? `thumbnails/${assetId}-${index + 1}.jpg`
  }));
}

export function buildWaveformSummary(durationMs: number, points = 24): WaveformSummary {
  const peaks = Array.from({ length: points }, (_, index) => {
    const phase = (index / Math.max(points - 1, 1)) * Math.PI * 3;
    return clampUnit(0.25 + Math.abs(Math.sin(phase)) * 0.75);
  });

  return {
    durationMs,
    peaks
  };
}

export function inferLumaSummary(sceneCuts: SceneCut[]): LumaSummary {
  if (sceneCuts.length === 0) {
    return {
      average: 0.5,
      minimum: 0.5,
      maximum: 0.5
    };
  }

  const values = sceneCuts.map((sceneCut) => clampUnit(0.2 + sceneCut.score * 0.6));
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    average: clampUnit(total / values.length),
    minimum: clampUnit(Math.min(...values)),
    maximum: clampUnit(Math.max(...values))
  };
}

export function inferMotionSummary(sceneCuts: SceneCut[]): MotionSummary {
  if (sceneCuts.length === 0) {
    return {
      average: 0.1,
      peak: 0.1
    };
  }

  const values = sceneCuts.map((sceneCut) => clampUnit(sceneCut.score));
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    average: clampUnit(total / values.length),
    peak: clampUnit(Math.max(...values))
  };
}

export function generateCutCandidatesFromAnalysis(
  analysis: AnalysisFile,
  options: CutGenerationOptions = {}
): CutCandidate[] {
  const boundaries = [0, ...analysis.sceneCuts.map((cut) => cut.timeMs), analysis.probe.durationMs]
    .filter((boundary, index, values) => boundary >= 0 && values.indexOf(boundary) === index)
    .sort((left, right) => left - right);
  const luma = analysis.luma ?? inferLumaSummary(analysis.sceneCuts);
  const motion = analysis.motion ?? inferMotionSummary(analysis.sceneCuts);

  return boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    const sceneCut = analysis.sceneCuts[index];
    const thumbnail = analysis.thumbnails?.[Math.min(index, (analysis.thumbnails?.length ?? 1) - 1)];

    return {
      id: `${analysis.assetId}-cut-${index + 1}`,
      assetId: analysis.assetId,
      analysisRefId: options.analysisRefId,
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs),
      sceneScore: sceneCut?.score,
      motion,
      luma,
      thumbnailPath: thumbnail?.path,
      status: options.status ?? 'new',
      favorite: false,
      tags: [],
      binIds: []
    };
  });
}

export function createAnalysisFile(
  id: string,
  assetId: string,
  probe: ProbeMetadata,
  sceneCuts: SceneCut[],
  options: {
    thumbnails?: ThumbnailReference[];
    waveform?: WaveformSummary;
    luma?: LumaSummary;
    motion?: MotionSummary;
  } = {}
): AnalysisFile {
  return normalizeAnalysisFile({
    id,
    assetId,
    probe,
    sceneCuts,
    thumbnails: options.thumbnails,
    waveform: options.waveform,
    luma: options.luma,
    motion: options.motion
  });
}
