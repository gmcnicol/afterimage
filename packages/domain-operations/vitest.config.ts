import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@afterimage/project-model': fileURLToPath(new URL('../project-model/src/index.ts', import.meta.url))
    }
  }
});
