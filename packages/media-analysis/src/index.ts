import type {
  AnalysisFile,
  AnalysisSummary,
  AudioChangeEvent,
  AudioChangeTrack,
  BeatTrack,
  CutCandidate,
  LumaSummary,
  MidiGestureTrack,
  MotionSummary,
  ProbeMetadata,
  ProbeStream,
  SceneCut,
  SyncEvent,
  SyncEventTrack,
  ThumbnailReference,
  WaveformSummary
} from '@afterimage/project-model';
import { normalizeAnalysisFile } from '@afterimage/project-model';
export * from './motion-fields.js';

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

export interface AudioChangeAnalysisLogs {
  astats?: string;
  aspectralstats?: string;
  ebur128?: string;
  silencedetect?: string;
}

export interface AudioChangeAnalysisResult {
  audioChangeTrack: AudioChangeTrack;
  syncEventTrack: SyncEventTrack;
}

interface MetadataFrame {
  timeMs: number;
  values: Record<string, number>;
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

function clampOptionalUnit(value: number | undefined): number | undefined {
  return value === undefined ? undefined : clampUnit(value);
}

function parseMetadataFrames(log: string): MetadataFrame[] {
  const frames: MetadataFrame[] = [];
  const normalizedLog = log.replace(/\\n/g, '\n');
  let currentTimeMs: number | undefined;
  let currentValues: Record<string, number> = {};

  const flush = () => {
    if (currentTimeMs === undefined || Object.keys(currentValues).length === 0) {
      return;
    }

    frames.push({
      timeMs: currentTimeMs,
      values: currentValues
    });
  };

  for (const line of normalizedLog.split(/\r?\n/)) {
    const timeMatch = line.match(/pts_time:([0-9.]+)/);
    if (timeMatch) {
      flush();
      currentTimeMs = Math.round(Number.parseFloat(timeMatch[1]) * 1000);
      currentValues = {};
      continue;
    }

    const metadataMatch = line.match(/(lavfi\.[^=\s]+)\s*=\s*(-?[0-9.]+)/);
    if (metadataMatch && currentTimeMs !== undefined) {
      currentValues[metadataMatch[1]] = Number.parseFloat(metadataMatch[2]);
    }
  }

  flush();

  return frames.sort((left, right) => left.timeMs - right.timeMs);
}

function dbToUnit(db: number, floor = -70, ceiling = 0): number {
  const normalized = (db - floor) / (ceiling - floor);
  return clampUnit(normalized);
}

function getFrameMetric(frame: MetadataFrame, candidates: string[]): number | undefined {
  for (const key of candidates) {
    if (key in frame.values) {
      return frame.values[key];
    }
  }

  for (const [key, value] of Object.entries(frame.values)) {
    if (candidates.some((candidate) => key.endsWith(candidate))) {
      return value;
    }
  }

  return undefined;
}

function createAudioChangeEvent(
  assetId: string,
  index: number,
  timeMs: number,
  kind: AudioChangeEvent['kind'],
  source: AudioChangeEvent['source'],
  strength: number,
  options: {
    confidence?: number;
    durationMs?: number;
    label?: string;
    metadata?: Record<string, number>;
  } = {}
): AudioChangeEvent {
  const metadata = options.metadata
    ? Object.fromEntries(Object.entries(options.metadata).map(([key, value]) => [key, Number(value.toFixed(4))]))
    : undefined;

  return {
    id: `${assetId}-${source}-${kind}-${index + 1}`,
    timeMs,
    kind,
    source,
    strength: clampUnit(strength),
    confidence: clampOptionalUnit(options.confidence),
    durationMs: options.durationMs,
    label: options.label,
    metadata
  };
}

function dedupeAudioChangeEvents(events: AudioChangeEvent[]): AudioChangeEvent[] {
  const deduped: AudioChangeEvent[] = [];

  for (const event of [...events].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.kind === event.kind && Math.abs(previous.timeMs - event.timeMs) <= 120) {
      if ((event.strength ?? 0) > (previous.strength ?? 0)) {
        deduped[deduped.length - 1] = event;
      }
      continue;
    }

    deduped.push(event);
  }

  return deduped;
}

function parseAstatsEvents(assetId: string, log: string): AudioChangeEvent[] {
  const frames = parseMetadataFrames(log);
  const events: AudioChangeEvent[] = [];

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const previousRms = getFrameMetric(previous, ['lavfi.astats.Overall.RMS_level', 'RMS_level']);
    const currentRms = getFrameMetric(current, ['lavfi.astats.Overall.RMS_level', 'RMS_level']);

    if (previousRms === undefined || currentRms === undefined) {
      continue;
    }

    const previousUnit = dbToUnit(previousRms);
    const currentUnit = dbToUnit(currentRms);
    const delta = Math.abs(currentUnit - previousUnit);

    if (delta >= 0.16) {
      events.push(createAudioChangeEvent(assetId, events.length, current.timeMs, 'energy-shift', 'astats', delta, {
        confidence: Math.max(0.35, delta),
        metadata: {
          rmsLevel: currentRms,
          previousRmsLevel: previousRms
        }
      }));
    }

    const peakLevel = getFrameMetric(current, ['lavfi.astats.Overall.Peak_level', 'Peak_level']);
    if (peakLevel !== undefined) {
      const peakUnit = dbToUnit(peakLevel);
      if (peakUnit >= 0.86 && delta >= 0.08) {
        events.push(createAudioChangeEvent(assetId, events.length, current.timeMs, 'onset-cluster', 'astats', peakUnit, {
          confidence: peakUnit,
          metadata: {
            peakLevel
          }
        }));
      }
    }
  }

  return events;
}

function parseEbur128Events(assetId: string, log: string): AudioChangeEvent[] {
  const frames = parseMetadataFrames(log);
  const events: AudioChangeEvent[] = [];

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const previousMomentary = getFrameMetric(previous, ['lavfi.r128.M', '.M']);
    const currentMomentary = getFrameMetric(current, ['lavfi.r128.M', '.M']);

    if (previousMomentary === undefined || currentMomentary === undefined) {
      continue;
    }

    const previousUnit = dbToUnit(previousMomentary, -70, -5);
    const currentUnit = dbToUnit(currentMomentary, -70, -5);
    const delta = Math.abs(currentUnit - previousUnit);

    if (delta >= 0.12) {
      events.push(createAudioChangeEvent(assetId, events.length, current.timeMs, 'energy-shift', 'ebur128', delta, {
        confidence: Math.max(0.3, delta),
        metadata: {
          momentaryLufs: currentMomentary
        }
      }));
    }
  }

  return events;
}

function parseAspectralEvents(assetId: string, log: string): AudioChangeEvent[] {
  const frames = parseMetadataFrames(log);
  const events: AudioChangeEvent[] = [];

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const previousCentroid = getFrameMetric(previous, ['centroid']);
    const currentCentroid = getFrameMetric(current, ['centroid']);
    const previousFlatness = getFrameMetric(previous, ['flatness']);
    const currentFlatness = getFrameMetric(current, ['flatness']);
    const previousRolloff = getFrameMetric(previous, ['rolloff']);
    const currentRolloff = getFrameMetric(current, ['rolloff']);

    const deltas = [
      previousCentroid !== undefined && currentCentroid !== undefined ? Math.abs(currentCentroid - previousCentroid) / Math.max(currentCentroid, previousCentroid, 1) : 0,
      previousFlatness !== undefined && currentFlatness !== undefined ? Math.abs(currentFlatness - previousFlatness) : 0,
      previousRolloff !== undefined && currentRolloff !== undefined ? Math.abs(currentRolloff - previousRolloff) / Math.max(currentRolloff, previousRolloff, 1) : 0
    ].filter((value) => Number.isFinite(value));

    if (deltas.length === 0) {
      continue;
    }

    const intensity = clampUnit(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
    if (intensity >= 0.18) {
      events.push(createAudioChangeEvent(assetId, events.length, current.timeMs, 'spectral-change', 'aspectralstats', intensity, {
        confidence: Math.max(0.35, intensity),
        metadata: {
          centroid: currentCentroid ?? 0,
          flatness: currentFlatness ?? 0,
          rolloff: currentRolloff ?? 0
        }
      }));
    }
  }

  return events;
}

function parseSilenceEvents(assetId: string, log: string): AudioChangeEvent[] {
  const normalizedLog = log.replace(/\\n/g, '\n');
  const events: AudioChangeEvent[] = [];

  for (const line of normalizedLog.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      const timeMs = Math.round(Number.parseFloat(startMatch[1]) * 1000);
      events.push(createAudioChangeEvent(assetId, events.length, timeMs, 'silence-start', 'silencedetect', 1, {
        confidence: 1,
        label: 'Silence starts'
      }));
    }

    const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (endMatch) {
      const timeMs = Math.round(Number.parseFloat(endMatch[1]) * 1000);
      const durationMs = Math.round(Number.parseFloat(endMatch[2]) * 1000);
      events.push(createAudioChangeEvent(assetId, events.length, timeMs, 'silence-end', 'silencedetect', 1, {
        confidence: 1,
        durationMs,
        label: 'Silence ends',
        metadata: {
          silenceDurationMs: durationMs
        }
      }));
    }
  }

  return events;
}

export function deriveSyncEventsFromAudioChangeTrack(track: AudioChangeTrack): SyncEventTrack {
  const events: SyncEvent[] = track.events.map((event, index) => ({
    id: `${track.assetId}-sync-${index + 1}`,
    timeMs: event.timeMs,
    source: 'audio-change',
    kind: event.kind === 'onset-cluster'
      ? 'accent'
      : event.kind === 'silence-start' || event.kind === 'silence-end'
        ? 'silence-boundary'
        : 'change',
    strength: event.strength,
    confidence: event.confidence,
    label: event.label,
    audioChangeEventId: event.id
  }));

  return {
    id: `${track.id}-sync`,
    assetId: track.assetId,
    derivedFromTrackId: track.id,
    events
  };
}

export function parseAudioChangeAnalysis(assetId: string, logs: AudioChangeAnalysisLogs): AudioChangeAnalysisResult {
  const events = dedupeAudioChangeEvents([
    ...(logs.astats ? parseAstatsEvents(assetId, logs.astats) : []),
    ...(logs.aspectralstats ? parseAspectralEvents(assetId, logs.aspectralstats) : []),
    ...(logs.ebur128 ? parseEbur128Events(assetId, logs.ebur128) : []),
    ...(logs.silencedetect ? parseSilenceEvents(assetId, logs.silencedetect) : [])
  ]);

  const generatedBy = Object.entries(logs)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
    .sort();
  const audioChangeTrack: AudioChangeTrack = {
    id: `${assetId}-audio-change`,
    assetId,
    generatedBy,
    events
  };

  return {
    audioChangeTrack,
    syncEventTrack: deriveSyncEventsFromAudioChangeTrack(audioChangeTrack)
  };
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
    audioChangeTrack?: AudioChangeTrack;
    syncEventTrack?: SyncEventTrack;
    beatTrack?: BeatTrack;
    midiGestureTrack?: MidiGestureTrack;
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
    audioChangeTrack: options.audioChangeTrack,
    syncEventTrack: options.syncEventTrack,
    beatTrack: options.beatTrack,
    midiGestureTrack: options.midiGestureTrack,
    luma: options.luma,
    motion: options.motion
  });
}
