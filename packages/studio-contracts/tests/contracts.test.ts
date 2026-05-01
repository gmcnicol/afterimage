import { describe, expect, it } from 'vitest';
import type { StudioCommandMap, StudioEventMap, StudioQueryMap } from '../src/index.js';

describe('@afterimage/studio-contracts', () => {
  it('exposes command, query, and event maps as typed contracts', () => {
    const commandRoute: keyof StudioCommandMap = 'project.save';
    const queryRoute: keyof StudioQueryMap = 'library.searchAssets';
    const eventType: keyof StudioEventMap = 'jobs.updated';

    expect(commandRoute).toBe('project.save');
    expect(queryRoute).toBe('library.searchAssets');
    expect(eventType).toBe('jobs.updated');
  });
});
