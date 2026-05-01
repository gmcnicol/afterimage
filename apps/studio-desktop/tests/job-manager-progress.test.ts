import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProgressRunner,
  parseFfmpegProgressRecords,
  parseFfmpegProgressTimeToMs
} from '../electron/services/job-manager';

describe('ffmpeg progress reporting', () => {
  it('parses ffmpeg progress protocol records and treats out_time values as microseconds', () => {
    const records = parseFfmpegProgressRecords([
      'frame=15',
      'out_time_ms=1500000',
      'out_time=00:00:01.500000',
      'progress=continue',
      'frame=30',
      'out_time_us=3000000',
      'progress=end',
      ''
    ].join('\n'));

    expect(records).toHaveLength(2);
    expect(parseFfmpegProgressTimeToMs(records[0])).toBe(1500);
    expect(parseFfmpegProgressTimeToMs(records[1])).toBe(3000);
  });

  it('drives runner progress from pipe:3 progress records, not stderr stats text', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'afterimage-progress-'));
    const fakeFfmpegPath = join(tempDir, 'fake-ffmpeg.sh');
    writeFileSync(fakeFfmpegPath, [
      '#!/bin/sh',
      'printf "frame=1\\nout_time_us=250000\\nprogress=continue\\n" >&3',
      'printf "time=99:00:00.00\\n" >&2',
      'printf "frame=2\\nout_time_us=500000\\nprogress=end\\n" >&3',
      'exit 0',
      ''
    ].join('\n'), 'utf8');
    chmodSync(fakeFfmpegPath, 0o755);

    const reports: Array<{ message: string; progress: number }> = [];
    const runner = createProgressRunner({
      label: 'render:test',
      binary: fakeFfmpegPath,
      args: []
    }, {
      phaseLabel: 'Rendering test',
      report: (message, progress) => {
        reports.push({ message, progress });
      },
      durationMs: 1000,
      startProgress: 0.1,
      endProgress: 0.9
    });

    const result = await runner(fakeFfmpegPath, [], {});

    expect(result.exitCode).toBe(0);
    expect(reports).toHaveLength(2);
    expect(reports[0].progress).toBeCloseTo(0.3);
    expect(reports[1].progress).toBeCloseTo(0.9);
    expect(reports.map((report) => report.message)).toEqual(['Rendering test 30%', 'Rendering test 90%']);
  });
});
