import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/fidelity',
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4321', deviceScaleFactor: 1, reducedMotion: 'reduce' }, // motion layer off: the static design is what we compare
  webServer: { command: 'pnpm dev --port 4321', url: 'http://localhost:4321', reuseExistingServer: true, timeout: 60_000 },
});
