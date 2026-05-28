import { contextBridge, ipcRenderer } from 'electron';
import type {
  LivePreloadBridge,
  LiveQueryMap,
  LiveQueryRoute
} from '@afterimage/studio-contracts';

const invoke = ((kind: 'query', route: string, payload: unknown) => {
  return ipcRenderer.invoke('live:invoke', { kind, route, payload }) as Promise<never>;
}) as LivePreloadBridge['invoke'];

const api: LivePreloadBridge = {
  invoke,
  getSession() {
    return invoke('query', 'live.getSession', undefined);
  }
};

contextBridge.exposeInMainWorld('afterimage', api);

export type LivePreloadInvoke = {
  <Route extends LiveQueryRoute>(
    kind: 'query',
    route: Route,
    payload: LiveQueryMap[Route]['payload']
  ): Promise<LiveQueryMap[Route]['result']>;
};
