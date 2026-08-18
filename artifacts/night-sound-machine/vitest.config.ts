import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    define: {
      __APP_VERSION__: JSON.stringify('1.0.0'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
  },
});
