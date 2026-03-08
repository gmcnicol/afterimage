import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@afterimage/ui': fileURLToPath(new URL('../../packages/ui/src/index.tsx', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
