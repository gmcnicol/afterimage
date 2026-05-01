import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogEntry } from '@afterimage/studio-contracts';

export interface Logger {
  setProjectRoot(nextProjectRoot?: string): void;
  log(level: LogEntry['level'], message: string, details?: string): Promise<LogEntry>;
  list(): LogEntry[];
}

export function createLogger(): Logger {
  let projectRoot: string | undefined;
  let entries: LogEntry[] = [];

  async function writeToDisk(entry: LogEntry): Promise<void> {
    if (!projectRoot) {
      return;
    }

    const logsDir = join(projectRoot, '.afterimage', 'logs');
    await mkdir(logsDir, { recursive: true });
    await appendFile(join(logsDir, 'studio.log'), `${entry.timestamp} [${entry.level}] ${entry.message}${entry.details ? ` :: ${entry.details}` : ''}\n`, 'utf8');
  }

  return {
    setProjectRoot(nextProjectRoot) {
      projectRoot = nextProjectRoot;
    },
    async log(level, message, details) {
      const entry: LogEntry = {
        id: `log-${entries.length + 1}`,
        timestamp: new Date().toISOString(),
        level,
        message,
        details
      };
      entries = [...entries, entry].slice(-400);
      const consoleLine = `[studio-desktop] ${entry.message}${entry.details ? ` :: ${entry.details}` : ''}`;
      if (level === 'error') {
        console.error(consoleLine);
      } else if (level === 'warn') {
        console.warn(consoleLine);
      }
      try {
        await writeToDisk(entry);
      } catch {}
      return entry;
    },
    list() {
      return entries;
    }
  };
}
