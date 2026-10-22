import { defineConfig } from 'vitest/config';

// Unit tests: pure functions only, no database needed. `npm run test:unit`
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
