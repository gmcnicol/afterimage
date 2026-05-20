import { spawn } from 'node:child_process';
import type {
  CommandExecutionResult,
  CommandRunner,
  CommandRunnerOptions,
  CommandSpec,
  ResolvedFfmpegTools,
  ResolvedToolBinary,
  ToolHealthReport,
  ToolVersionInfo
} from './types.js';

async function defaultCommandRunner(binary: string, args: string[], options: CommandRunnerOptions): Promise<CommandExecutionResult> {
  if (options.signal?.aborted) {
    throw new DOMException('Command aborted before start.', 'AbortError');
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    const abortHandler = () => {
      child.kill('SIGTERM');
      reject(new DOMException(`Command "${binary}" aborted.`, 'AbortError'));
    };

    options.signal?.addEventListener('abort', abortHandler, { once: true });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', abortHandler);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      options.signal?.removeEventListener('abort', abortHandler);
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr: signal ? `${stderr}\nProcess terminated by signal ${signal}.` : stderr
      });
    });
  });
}

export async function executeCommandSpec(
  command: CommandSpec,
  options: CommandRunnerOptions & { runner?: CommandRunner; rejectOnNonZeroExit?: boolean } = {}
): Promise<CommandExecutionResult> {
  const runner = options.runner ?? defaultCommandRunner;
  const result = await runner(command.binary, command.args, {
    cwd: options.cwd ?? command.cwd,
    env: options.env ? { ...options.env, ...command.env } : (command.env ? { ...process.env, ...command.env } : options.env),
    signal: options.signal
  });

  if ((options.rejectOnNonZeroExit ?? true) && result.exitCode !== 0) {
    const stderrTail = result.stderr
      .trim()
      .split('\n')
      .slice(-12)
      .join('\n')
      .trim();
    const details = stderrTail ? `\n${stderrTail}` : '';
    throw new Error(`Command "${command.label}" failed with exit code ${result.exitCode}.${details}`);
  }

  return result;
}

export async function getToolchainHealth(
  tools: ResolvedFfmpegTools,
  options: { runner?: CommandRunner; env?: NodeJS.ProcessEnv } = {}
): Promise<ToolHealthReport> {
  const runner = options.runner ?? defaultCommandRunner;
  const warnings: string[] = [];

  async function inspect(tool: ResolvedToolBinary | undefined, binaryName: string): Promise<ToolVersionInfo | undefined> {
    if (!tool) {
      warnings.push(`${binaryName} is not available.`);
      return undefined;
    }

    try {
      const result = await runner(tool.path, ['-version'], { env: options.env });
      const versionLine = (result.stdout || result.stderr).split(/\r?\n/).find(Boolean);
      return {
        path: tool.path,
        versionLine,
        available: result.exitCode === 0
      };
    } catch (error) {
      warnings.push(`${binaryName} version probe failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        path: tool.path,
        available: false
      };
    }
  }

  const ffmpeg = await inspect(tools.ffmpeg, 'ffmpeg');
  const ffprobe = await inspect(tools.ffprobe, 'ffprobe');
  const ffplay = await inspect(tools.ffplay, 'ffplay');
  const available = Boolean(ffmpeg?.available && ffprobe?.available);

  return {
    available,
    versions: {
      ffmpeg: ffmpeg ?? { path: '', available: false },
      ffprobe: ffprobe ?? { path: '', available: false },
      ffplay
    },
    warnings
  };
}
