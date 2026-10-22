import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/env.ts'],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    // Load the app once for all files (much faster on slow machines); each file resets the DB itself.
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
