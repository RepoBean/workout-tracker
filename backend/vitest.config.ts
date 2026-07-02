import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // forks, not threads — the sqlite3 native addon is not worker-thread safe
    pool: 'forks',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
