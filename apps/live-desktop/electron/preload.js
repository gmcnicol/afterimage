import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('afterimage', {
  runtime: 'desktop-shell'
});
