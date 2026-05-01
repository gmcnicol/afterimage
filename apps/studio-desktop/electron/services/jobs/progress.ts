import { spawn } from 'node:child_process';
import type {
  CommandExecutionResult,
  CommandRunner,
  CommandRunnerOptions,
  CommandSpec
} from '@afterimage/ffmpeg-compiler';
import { clampProgress } from './artifacts.js';

type FfmpegProgressRecord = Record<string, string>;

function parseFfmpegClockTimeToMs(value: string): number | undefined {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);

  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return Math.round((((hours * 60) + minutes) * 60 + seconds) * 1000);
}

export function parseFfmpegProgressTimeToMs(record: FfmpegProgressRecord): number | undefined {
  const microsecondValue = record.out_time_us ?? record.out_time_ms;
  if (microsecondValue !== undefined && microsecondValue !== 'N/A') {
    const microseconds = Number.parseInt(microsecondValue, 10);
    if (Number.isFinite(microseconds) && microseconds >= 0) {
      return Math.round(microseconds / 1000);
    }
  }

  if (record.out_time && record.out_time !== 'N/A') {
    return parseFfmpegClockTimeToMs(record.out_time);
  }

  return undefined;
}

export function parseFfmpegProgressRecords(text: string): FfmpegProgressRecord[] {
  const records: FfmpegProgressRecord[] = [];
  let current: FfmpegProgressRecord = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    current[key] = value;

    if (key === 'progress') {
      records.push(current);
      current = {};
    }
  }

  return records;
}

function addFfmpegProgressArgs(args: string[]): string[] {
  if (args.includes('-progress')) {
    return args;
  }

  return ['-progress', 'pipe:3', '-nostats', '-stats_period', '0.25', ...args];
}

export function createProgressRunner(
  command: CommandSpec,
  options: {
    phaseLabel: string;
    report: (message: string, progress: number) => void;
    durationMs: number;
    startProgress: number;
    endProgress: number;
  }
): CommandRunner {
  return async (binary: string, args: string[], runnerOptions: CommandRunnerOptions): Promise<CommandExecutionResult> => {
    if (runnerOptions.signal?.aborted) {
      throw new DOMException('Command aborted before start.', 'AbortError');
    }

    return await new Promise((resolve, reject) => {
      const child = spawn(binary, addFfmpegProgressArgs(args), {
        cwd: runnerOptions.cwd,
        env: runnerOptions.env,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let lastReportedProgress = options.startProgress;
      let lastReportedAt = 0;
      let progressLineBuffer = '';
      let progressRecord: FfmpegProgressRecord = {};

      const reportProgressRecord = (record: FfmpegProgressRecord) => {
        if (options.durationMs <= 0) {
          return;
        }

        const encodedMs = parseFfmpegProgressTimeToMs(record);
        if (encodedMs === undefined) {
          return;
        }

        const ratio = clampProgress(encodedMs / options.durationMs);
        const recordProgress = record.progress === 'end'
          ? options.endProgress
          : options.startProgress + ((options.endProgress - options.startProgress) * ratio);
        const nextProgress = Math.max(lastReportedProgress, clampProgress(recordProgress));
        const now = Date.now();

        if (record.progress !== 'end' && (nextProgress - lastReportedProgress) < 0.01 && (now - lastReportedAt) < 250) {
          return;
        }

        lastReportedProgress = nextProgress;
        lastReportedAt = now;
        options.report(`${options.phaseLabel} ${Math.round(nextProgress * 100)}%`, nextProgress);
      };

      const consumeProgressText = (text: string) => {
        progressLineBuffer += text;
        const lines = progressLineBuffer.split(/\r?\n/);
        progressLineBuffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            continue;
          }

          const separatorIndex = line.indexOf('=');
          if (separatorIndex <= 0) {
            continue;
          }

          const key = line.slice(0, separatorIndex);
          const value = line.slice(separatorIndex + 1);
          progressRecord[key] = value;

          if (key === 'progress') {
            reportProgressRecord(progressRecord);
            progressRecord = {};
          }
        }
      };

      const abortHandler = () => {
        child.kill('SIGTERM');
        reject(new DOMException(`Command "${command.label}" aborted.`, 'AbortError'));
      };

      runnerOptions.signal?.addEventListener('abort', abortHandler, { once: true });

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const progressStream = child.stdio[3];
      progressStream?.on('data', (chunk) => {
        consumeProgressText(chunk.toString());
      });

      child.on('error', (error) => {
        runnerOptions.signal?.removeEventListener('abort', abortHandler);
        reject(error);
      });

      child.on('close', (exitCode, signal) => {
        runnerOptions.signal?.removeEventListener('abort', abortHandler);
        if (progressLineBuffer) {
          consumeProgressText('\n');
        }
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr: signal ? `${stderr}\nProcess terminated by signal ${signal}.` : stderr
        });
      });
    });
  };
}
