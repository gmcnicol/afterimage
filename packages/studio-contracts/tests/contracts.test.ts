import { describe, expect, it } from 'vitest';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import type {
  StudioAgentInput,
  StudioAgentOutput,
  StudioCommandMap,
  StudioEventMap,
  StudioQueryMap,
  StudioRenderArtifact,
  StudioRenderDiagnostic
} from '../src/index.js';

describe('@afterimage/studio-contracts', () => {
  it('exposes command, query, and event maps as typed contracts', () => {
    const commandRoute: keyof StudioCommandMap = 'project.importArchiveSidecars';
    const queryRoute: keyof StudioQueryMap = 'project.listArchiveSidecars';
    const eventType: keyof StudioEventMap = 'jobs.updated';

    expect(commandRoute).toBe('project.importArchiveSidecars');
    expect(queryRoute).toBe('project.listArchiveSidecars');
    expect(eventType).toBe('jobs.updated');
  });

  it('exposes serializable agent boundary contracts', () => {
    const artifact = {
      id: 'artifact:preview-output:abc',
      role: 'preview-output',
      path: '/tmp/preview.mp4',
      cacheKey: 'cache-key',
      producedBy: 'pass:ffmpeg-render',
      provenance: {
        mode: 'preview'
      }
    } satisfies StudioRenderArtifact;
    const input = {
      agent: 'preview-render',
      project: {} as NormalizedProjectFile,
      projectRoot: '/project',
      outputPath: artifact.path,
      captureSessionId: 'capture-session-main',
      captureLogId: 'capture-log-main',
      availableArchiveIds: ['archive-source-alpha']
    } satisfies StudioAgentInput;
    const diagnostic = {
      id: 'diagnostic:capture-replay:abc',
      severity: 'warning',
      code: 'CAPTURE_REPLAY_UNSUPPORTED_VALUE',
      message: 'Unsupported capture replay event.',
      path: 'captureLogs.capture-log-main.events.capture-event-unsupported.kind',
      nodeId: 'operation:preview:variant-main',
      passId: 'pass:ffmpeg-render',
      requirementId: 'requirement:ffmpeg-render'
    } satisfies StudioRenderDiagnostic;
    const output = {
      kind: 'preview',
      outputPath: artifact.path,
      artifacts: [artifact],
      diagnostics: [diagnostic]
    } satisfies StudioAgentOutput;

    expect(input.agent).toBe('preview-render');
    expect(output.kind).toBe('preview');
    expect(output.artifacts?.[0]?.cacheKey).toBe('cache-key');
    expect(output.diagnostics?.[0]).toEqual(diagnostic);
  });
});
