import { describe, expect, it } from 'vitest';
import { fixtureAnalysis, fixtureFfprobeOutput, fixtureSceneDetectionLog } from '../../test-fixtures/src';
import { generateCutCandidatesFromAnalysis, parseFfprobeOutput, parseSceneDetectionOutput } from '../src';

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
});
