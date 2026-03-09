import { describe, expect, it } from 'vitest';
import { fixtureAnalysis, fixtureFfprobeOutput, fixtureSceneDetectionLog } from '../../test-fixtures/src';
import {
  deriveSyncEventsFromAudioChangeTrack,
  generateCutCandidatesFromAnalysis,
  parseAudioChangeAnalysis,
  parseFfprobeOutput,
  parseSceneDetectionOutput
} from '../src';

describe('@afterimage/media-analysis', () => {
  it('parses ffprobe json into probe metadata', () => {
    expect(parseFfprobeOutput(fixtureFfprobeOutput)).toEqual({
      bitRate: 1200000,
      durationMs: 5000,
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      streams: [
        {
          avgFrameRate: '30/1',
          codecName: 'h264',
          codecType: 'video',
          height: 720,
          width: 1280
        },
        {
          channels: 2,
          codecName: 'aac',
          codecType: 'audio',
          sampleRate: 48000
        }
      ]
    });
  });

  it('parses scene detection logs and generates deterministic cut candidates', () => {
    expect(parseSceneDetectionOutput(fixtureSceneDetectionLog)).toEqual({
      sceneCuts: [
        { timeMs: 1200, score: 0.61 },
        { timeMs: 2600, score: 0.77 }
      ],
      summary: {
        sceneCount: 2
      }
    });

    expect(generateCutCandidatesFromAnalysis(fixtureAnalysis, {
      analysisRefId: 'analysis-asset-alpha'
    })).toEqual([
      {
        analysisRefId: 'analysis-asset-alpha',
        assetId: 'asset-alpha',
        binIds: [],
        durationMs: 1200,
        endMs: 1200,
        favorite: false,
        id: 'asset-alpha-cut-1',
        luma: {
          average: 0.614,
          maximum: 0.81,
          minimum: 0.42
        },
        motion: {
          average: 0.69,
          peak: 0.77
        },
        sceneScore: 0.61,
        startMs: 0,
        status: 'new',
        tags: [],
        thumbnailPath: 'fixtures/thumbnails/source-alpha-1.jpg'
      },
      {
        analysisRefId: 'analysis-asset-alpha',
        assetId: 'asset-alpha',
        binIds: [],
        durationMs: 1400,
        endMs: 2600,
        favorite: false,
        id: 'asset-alpha-cut-2',
        luma: {
          average: 0.614,
          maximum: 0.81,
          minimum: 0.42
        },
        motion: {
          average: 0.69,
          peak: 0.77
        },
        sceneScore: 0.77,
        startMs: 1200,
        status: 'new',
        tags: [],
        thumbnailPath: 'fixtures/thumbnails/source-alpha-2.jpg'
      },
      {
        analysisRefId: 'analysis-asset-alpha',
        assetId: 'asset-alpha',
        binIds: [],
        durationMs: 2400,
        endMs: 5000,
        favorite: false,
        id: 'asset-alpha-cut-3',
        luma: {
          average: 0.614,
          maximum: 0.81,
          minimum: 0.42
        },
        motion: {
          average: 0.69,
          peak: 0.77
        },
        sceneScore: undefined,
        startMs: 2600,
        status: 'new',
        tags: [],
        thumbnailPath: 'fixtures/thumbnails/source-alpha-2.jpg'
      }
    ]);
  });

  it('parses audio change logs into normalized change and sync tracks', () => {
    const analysis = parseAudioChangeAnalysis('asset-music', {
      astats: [
        'frame:0 pts:0 pts_time:0',
        'lavfi.astats.Overall.RMS_level=-42.0',
        'lavfi.astats.Overall.Peak_level=-14.0',
        'frame:1 pts:1 pts_time:1.0',
        'lavfi.astats.Overall.RMS_level=-10.0',
        'lavfi.astats.Overall.Peak_level=-0.5'
      ].join('\n'),
      aspectralstats: [
        'frame:0 pts:0 pts_time:0',
        'lavfi.aspectralstats.centroid=100.0',
        'lavfi.aspectralstats.flatness=0.10',
        'lavfi.aspectralstats.rolloff=1000.0',
        'frame:1 pts:1 pts_time:1.5',
        'lavfi.aspectralstats.centroid=400.0',
        'lavfi.aspectralstats.flatness=0.60',
        'lavfi.aspectralstats.rolloff=4000.0'
      ].join('\n'),
      ebur128: [
        'frame:0 pts:0 pts_time:0',
        'lavfi.r128.M=-35.0',
        'frame:1 pts:1 pts_time:2.0',
        'lavfi.r128.M=-8.0'
      ].join('\n'),
      silencedetect: [
        '[silencedetect] silence_start: 3.0',
        '[silencedetect] silence_end: 4.2 | silence_duration: 1.2'
      ].join('\n')
    });

    expect(analysis.audioChangeTrack.generatedBy).toEqual(['aspectralstats', 'astats', 'ebur128', 'silencedetect']);
    expect(analysis.audioChangeTrack.events.map((event) => `${event.kind}@${event.timeMs}`)).toEqual([
      'energy-shift@1000',
      'onset-cluster@1000',
      'spectral-change@1500',
      'energy-shift@2000',
      'silence-start@3000',
      'silence-end@4200'
    ]);
    expect(analysis.syncEventTrack.events.map((event) => event.kind)).toEqual([
      'change',
      'accent',
      'change',
      'change',
      'silence-boundary',
      'silence-boundary'
    ]);
  });

  it('derives sync events deterministically from audio change events', () => {
    expect(deriveSyncEventsFromAudioChangeTrack({
      id: 'asset-music-audio-change',
      assetId: 'asset-music',
      generatedBy: ['astats'],
      events: [
        {
          id: 'event-1',
          timeMs: 500,
          kind: 'onset-cluster',
          source: 'astats',
          strength: 0.82
        },
        {
          id: 'event-2',
          timeMs: 1200,
          kind: 'silence-start',
          source: 'silencedetect',
          strength: 1
        }
      ]
    })).toEqual({
      assetId: 'asset-music',
      derivedFromTrackId: 'asset-music-audio-change',
      events: [
        {
          audioChangeEventId: 'event-1',
          confidence: undefined,
          id: 'asset-music-sync-1',
          kind: 'accent',
          label: undefined,
          source: 'audio-change',
          strength: 0.82,
          timeMs: 500
        },
        {
          audioChangeEventId: 'event-2',
          confidence: undefined,
          id: 'asset-music-sync-2',
          kind: 'silence-boundary',
          label: undefined,
          source: 'audio-change',
          strength: 1,
          timeMs: 1200
        }
      ],
      id: 'asset-music-audio-change-sync'
    });
  });
});
