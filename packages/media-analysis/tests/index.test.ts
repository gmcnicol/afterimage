import { describe, expect, it } from 'vitest';
import { fixtureFfprobeOutput, fixtureSceneDetectionLog } from '../../test-fixtures/src';
import { parseFfprobeOutput, parseSceneDetectionOutput } from '../src';

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

  it('parses scene detection logs into canonical cuts', () => {
    expect(parseSceneDetectionOutput(fixtureSceneDetectionLog)).toEqual({
      sceneCuts: [
        { timeMs: 1200, score: 0.61 },
        { timeMs: 2600, score: 0.77 }
      ],
      summary: {
        sceneCount: 2
      }
    });
  });
});
