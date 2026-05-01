import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@afterimage/ui': fileURLToPath(new URL('../../packages/ui/src/index.tsx', import.meta.url)),
      '@afterimage/domain-operations': fileURLToPath(new URL('../../packages/domain-operations/src/index.ts', import.meta.url)),
      '@afterimage/project-model': fileURLToPath(new URL('../../packages/project-model/src/index.ts', import.meta.url)),
      '@afterimage/schema-validators': fileURLToPath(new URL('../../packages/schema-validators/src/index.ts', import.meta.url)),
      '@afterimage/ffmpeg-compiler': fileURLToPath(new URL('../../packages/ffmpeg-compiler/src/index.ts', import.meta.url)),
      '@afterimage/media-analysis': fileURLToPath(new URL('../../packages/media-analysis/src/index.ts', import.meta.url)),
      '@afterimage/preset-library': fileURLToPath(new URL('../../packages/preset-library/src/index.ts', import.meta.url)),
      '@afterimage/midi-engine': fileURLToPath(new URL('../../packages/midi-engine/src/index.ts', import.meta.url)),
      '@afterimage/export-profiles': fileURLToPath(new URL('../../packages/export-profiles/src/index.ts', import.meta.url)),
      '@afterimage/studio-contracts': fileURLToPath(new URL('../../packages/studio-contracts/src/index.ts', import.meta.url)),
      '@afterimage/studio-bus': fileURLToPath(new URL('../../packages/studio-bus/src/index.ts', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
