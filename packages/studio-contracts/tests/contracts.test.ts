import { describe, expect, it } from 'vitest';
import type { StudioAgentInput, StudioAgentOutput, StudioCommandMap, StudioEventMap, StudioQueryMap } from '../src/index.js';

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
    const input = {
      agent: 'library-scan',
      rootId: 'root-1',
      rootPath: '/media'
    } satisfies StudioAgentInput;
    const output = {
      kind: 'library-scan',
      rootId: 'root-1'
    } satisfies StudioAgentOutput;

    expect(input.agent).toBe('library-scan');
    expect(output.kind).toBe('library-scan');
  });
});
