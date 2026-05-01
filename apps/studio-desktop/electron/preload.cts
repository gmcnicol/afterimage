import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  StudioCommandMap,
  StudioCommandRoute,
  StudioEventMap,
  StudioEventType,
  StudioPreloadBridge,
  StudioQueryMap,
  StudioQueryRoute
} from '@afterimage/studio-contracts';

const knownEvents = new Set<string>([
  'jobs.updated',
  'project.recentProjectsChanged'
]);

function isKnownStudioEventType(value: unknown): value is StudioEventType {
  return typeof value === 'string' && knownEvents.has(value);
}

const invoke = ((kind: 'command' | 'query', route: string, payload: unknown) => {
  return ipcRenderer.invoke('studio:invoke', { kind, route, payload }) as Promise<never>;
}) as StudioPreloadBridge['invoke'];

const api: StudioPreloadBridge = {
  invoke,
  subscribe(eventType, listener) {
    if (!isKnownStudioEventType(eventType)) {
      throw new Error(`Unknown Studio event type: ${eventType}`);
    }

    const handler = (_event: IpcRendererEvent, envelope: { type: unknown; payload: unknown }) => {
      if (envelope.type === eventType && isKnownStudioEventType(envelope.type)) {
        listener(envelope.payload as StudioEventMap[typeof eventType]);
      }
    };

    ipcRenderer.on('studio:event', handler);

    return () => {
      ipcRenderer.removeListener('studio:event', handler);
    };
  }
};

contextBridge.exposeInMainWorld('afterimage', api);

export type StudioPreloadInvoke = {
  <Route extends StudioCommandRoute>(
    kind: 'command',
    route: Route,
    payload: StudioCommandMap[Route]['payload']
  ): Promise<StudioCommandMap[Route]['result']>;
  <Route extends StudioQueryRoute>(
    kind: 'query',
    route: Route,
    payload: StudioQueryMap[Route]['payload']
  ): Promise<StudioQueryMap[Route]['result']>;
};
