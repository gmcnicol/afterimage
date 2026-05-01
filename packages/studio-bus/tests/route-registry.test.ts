import { describe, expect, it } from 'vitest';
import { createInMemoryRequestBus, createRouteRegistry, isKnownStudioEventType, type RouteHandlerMap } from '../src/index.js';
import type { StudioCommandMap, StudioQueryMap } from '@afterimage/studio-contracts';

function createHandlers(): {
  commands: RouteHandlerMap<StudioCommandMap>;
  queries: RouteHandlerMap<StudioQueryMap>;
} {
  const commands = new Proxy({}, {
    get: (_target, property) => async (payload: unknown) => ({ route: String(property), payload })
  }) as RouteHandlerMap<StudioCommandMap>;
  const queries = new Proxy({}, {
    get: (_target, property) => async (payload: unknown) => ({ route: String(property), payload })
  }) as RouteHandlerMap<StudioQueryMap>;

  return {
    commands: {
      ...commands,
      'project.save': async (payload) => ({ ...payload, recentProjects: [] })
    },
    queries: {
      ...queries,
      'library.searchAssets': async () => ({ assets: [], total: 0 })
    }
  };
}

describe('@afterimage/studio-bus route registry', () => {
  it('dispatches known command and query routes', async () => {
    const registry = createRouteRegistry(createHandlers().commands, createHandlers().queries);

    await expect(registry.handle({
      kind: 'query',
      route: 'library.searchAssets',
      payload: undefined
    })).resolves.toEqual({ assets: [], total: 0 });
  });

  it('rejects unknown routes', async () => {
    const registry = createRouteRegistry({} as RouteHandlerMap<StudioCommandMap>, {} as RouteHandlerMap<StudioQueryMap>);

    await expect(registry.handle({
      kind: 'command',
      route: 'project.save',
      payload: undefined
    } as never)).rejects.toThrow('Unknown Studio command route: project.save');
  });

  it('supports typed in-memory event subscriptions', () => {
    const registry = createRouteRegistry(createHandlers().commands, createHandlers().queries);
    const bus = createInMemoryRequestBus(registry);
    const received: string[] = [];

    const unsubscribe = bus.subscribe('project.recentProjectsChanged', (recentProjects) => {
      received.push(...recentProjects);
    });

    bus.publish('project.recentProjectsChanged', ['/tmp/project.afterimage.json']);
    unsubscribe();
    bus.publish('project.recentProjectsChanged', ['/tmp/ignored.afterimage.json']);

    expect(received).toEqual(['/tmp/project.afterimage.json']);
  });

  it('identifies only known Studio events for bridge forwarding', () => {
    expect(isKnownStudioEventType('jobs.updated')).toBe(true);
    expect(isKnownStudioEventType('project.recentProjectsChanged')).toBe(true);
    expect(isKnownStudioEventType('jobs:updated')).toBe(false);
    expect(isKnownStudioEventType('unknown.event')).toBe(false);
  });
});
