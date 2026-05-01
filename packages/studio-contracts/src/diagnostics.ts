import type { NormalizedProjectFile } from '@afterimage/project-model';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}

export interface DiagnosticsSnapshot {
  toolchain: {
    available: boolean;
    warnings: string[];
    versions: Record<string, { path: string; versionLine?: string; available: boolean } | undefined>;
  };
  warnings: string[];
  missingMedia: string[];
  recentCommands: string[];
  logs: LogEntry[];
  environmentSummary: Record<string, string>;
}

export interface DiagnosticsQueryMap {
  'diagnostics.getReport': {
    payload: { project?: NormalizedProjectFile; projectRoot?: string } | undefined;
    result: DiagnosticsSnapshot;
  };
  'diagnostics.getLogs': {
    payload: undefined;
    result: LogEntry[];
  };
}
