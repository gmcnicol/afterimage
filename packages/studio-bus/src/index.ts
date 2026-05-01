import type {
  StudioCommandMap,
  StudioCommandRoute,
  StudioEventMap,
  StudioEventType,
  StudioInvokeEnvelope,
  StudioQueryMap,
  StudioQueryRoute
} from '@afterimage/studio-contracts';

export interface MessageEnvelope<TPayload> {
  id: string;
  payload: TPayload;
}

export type RouteHandler<TPayload, TResult> = (payload: TPayload) => Promise<TResult> | TResult;

export type RouteHandlerMap<TMap extends { [Route in keyof TMap]: { payload: unknown; result: unknown } }> = {
  [Route in keyof TMap & string]: RouteHandler<TMap[Route]['payload'], TMap[Route]['result']>;
};

export type StudioEventListener<EventType extends StudioEventType = StudioEventType> = (
  payload: StudioEventMap[EventType]
) => void;

export interface StudioRequestBus {
  invoke<Route extends StudioCommandRoute>(
    kind: 'command',
    route: Route,
    payload: StudioCommandMap[Route]['payload']
  ): Promise<StudioCommandMap[Route]['result']>;
  invoke<Route extends StudioQueryRoute>(
    kind: 'query',
    route: Route,
    payload: StudioQueryMap[Route]['payload']
  ): Promise<StudioQueryMap[Route]['result']>;
  subscribe<EventType extends StudioEventType>(
    eventType: EventType,
    listener: (payload: StudioEventMap[EventType]) => void
  ): () => void;
  publish<EventType extends StudioEventType>(eventType: EventType, payload: StudioEventMap[EventType]): void;
}

export interface RouteRegistry {
  commandRoutes: ReadonlySet<string>;
  queryRoutes: ReadonlySet<string>;
  handle(envelope: StudioInvokeEnvelope): Promise<unknown>;
}

export const KNOWN_STUDIO_EVENT_TYPES = [
  'jobs.updated',
  'project.recentProjectsChanged'
] as const satisfies readonly StudioEventType[];

export function isKnownStudioEventType(value: unknown): value is StudioEventType {
  return typeof value === 'string' && (KNOWN_STUDIO_EVENT_TYPES as readonly string[]).includes(value);
}

export function createRouteRegistry(
  commands: RouteHandlerMap<StudioCommandMap>,
  queries: RouteHandlerMap<StudioQueryMap>
): RouteRegistry {
  const commandRoutes = new Set(Object.keys(commands));
  const queryRoutes = new Set(Object.keys(queries));

  return {
    commandRoutes,
    queryRoutes,
    async handle(envelope) {
      if (envelope.kind === 'command') {
        const handler = commands[envelope.route];
        if (!handler) {
          throw new Error(`Unknown Studio command route: ${envelope.route}`);
        }
        return handler(envelope.payload as never);
      }

      if (envelope.kind !== 'query') {
        throw new Error(`Unknown Studio route kind: ${(envelope as { kind?: unknown }).kind}`);
      }

      const handler = queries[envelope.route];
      if (!handler) {
        throw new Error(`Unknown Studio query route: ${envelope.route}`);
      }
      return handler(envelope.payload as never);
    }
  };
}

export function createInMemoryRequestBus(registry: RouteRegistry): StudioRequestBus {
  const listeners = new Map<StudioEventType, Set<StudioEventListener>>();

  return {
    async invoke(kind: 'command' | 'query', route: string, payload: unknown) {
      return registry.handle({ kind, route, payload } as StudioInvokeEnvelope) as Promise<never>;
    },
    subscribe(eventType, listener) {
      const eventListeners = listeners.get(eventType) ?? new Set<StudioEventListener>();
      eventListeners.add(listener as StudioEventListener);
      listeners.set(eventType, eventListeners);

      return () => {
        eventListeners.delete(listener as StudioEventListener);
        if (eventListeners.size === 0) {
          listeners.delete(eventType);
        }
      };
    },
    publish(eventType, payload) {
      for (const listener of listeners.get(eventType) ?? []) {
        listener(payload as never);
      }
    }
  };
}
