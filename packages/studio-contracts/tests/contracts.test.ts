import { describe, expect, it } from 'vitest';
import type {
  StudioAgentInput,
  StudioAgentOutput,
  StudioCommandMap,
  StudioEventMap,
  StudioQueryMap,
  StudioRenderArtifact
} from '../src/index.js';

describe('@afterimage/studio-contracts', () => {
  it('exposes command, query, and event maps as typed contracts', () => {
    const commandRoute: keyof StudioCommandMap = 'project.save';
    const queryRoute: keyof StudioQueryMap = 'library.searchAssets';
    const eventType: keyof StudioEventMap = 'jobs.updated';

    expect(commandRoute).toBe('project.save');
    expect(queryRoute).toBe('library.searchAssets');
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
      agent: 'library-scan',
      rootId: 'root-1',
      rootPath: '/media'
    } satisfies StudioAgentInput;
    const output = {
      kind: 'preview',
      outputPath: artifact.path,
      artifacts: [artifact]
    } satisfies StudioAgentOutput;

    expect(input.agent).toBe('library-scan');
    expect(output.kind).toBe('preview');
    expect(output.artifacts?.[0]?.cacheKey).toBe('cache-key');
  });
});
