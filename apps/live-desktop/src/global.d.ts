import type { LivePreloadBridge } from '@afterimage/studio-contracts';

declare global {
  interface Window {
    afterimage?: LivePreloadBridge;
  }
}

export {};
