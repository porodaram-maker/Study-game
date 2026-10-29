import path from 'node:path';
import { defineConfig } from 'vitest/config';

// server-only는 Next 번들러 밖에서 import하면 던지므로 테스트에서는 빈 모듈로 바꾼다.
const alias = { '@': import.meta.dirname, 'server-only': `${import.meta.dirname}/tests/stubs/server-only.ts` };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
