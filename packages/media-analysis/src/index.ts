import type { AnalysisFile, AnalysisSummary, ProbeMetadata, ProbeStream, SceneCut } from '@afterimage/project-model';
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

export function createAnalysisFile(id: string, sourceId: string, probe: ProbeMetadata, sceneCuts: SceneCut[]): AnalysisFile {
  return normalizeAnalysisFile({
    id,
    sourceId,
    probe,
    sceneCuts
  });
}
