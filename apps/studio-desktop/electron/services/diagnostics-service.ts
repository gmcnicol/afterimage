import { access } from 'node:fs/promises';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import { collectProjectIntegrityIssues } from '@afterimage/project-model';
import { getToolchainHealth, resolveFfmpegTools } from '@afterimage/ffmpeg-compiler';
import type { DiagnosticsSnapshot } from '../../src/shared/contracts.js';
import type { Logger } from './logger.js';

interface DiagnosticsServiceOptions {
  logger: Logger;
}

export function createDiagnosticsService({ logger }: DiagnosticsServiceOptions) {
  return {
    async getReport(input: { project?: NormalizedProjectFile; projectRoot?: string } = {}): Promise<DiagnosticsSnapshot> {
      const { project, projectRoot } = input;

      let toolchain: DiagnosticsSnapshot['toolchain'];
      try {
        toolchain = await getToolchainHealth(resolveFfmpegTools());
      } catch (error) {
        toolchain = {
          available: false,
          warnings: [error instanceof Error ? error.message : String(error)],
          versions: {}
        };
      }

      const missingMedia: string[] = [];
      const integrityWarnings: string[] = [];
      if (project) {
        for (const asset of project.assets) {
          try {
            await access(asset.path.absolutePath);
          } catch {
            missingMedia.push(asset.path.absolutePath);
          }
        }
        integrityWarnings.push(
          ...collectProjectIntegrityIssues(project).map((issue) => `${issue.path}: ${issue.message}`)
        );
      }

      const logs = logger.list();
      return {
        toolchain,
        warnings: [...toolchain.warnings, ...integrityWarnings],
        missingMedia,
        recentCommands: logs.map((entry) => entry.message).slice(-12),
        logs,
        environmentSummary: {
          platform: process.platform,
          node: process.version,
          electron: process.versions.electron ?? 'unknown',
          cwd: process.cwd(),
          projectRoot: projectRoot ?? 'unset'
        }
      };
    }
  };
}
