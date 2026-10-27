import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/engine/**/*.ts',
        'src/editor/**/*.ts',
        'src/storage/**/*.ts',
        'src/runtime/traceback.ts',
      ],
      exclude: ['src/**/index.ts', 'src/engine/renderer/**'],
    },
  },
});
