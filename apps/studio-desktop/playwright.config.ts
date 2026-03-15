import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /electron-smoke\.pw\.ts/,
  timeout: 30_000
});
