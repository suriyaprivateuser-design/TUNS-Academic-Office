import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': fromRoot('./src'),
      // โมดูล `server-only` โยน error เมื่อถูก import นอก React Server environment
      // ในการทดสอบจึงแทนด้วย stub ว่าง (การกันฝั่ง client ถูกตรวจจริงตอน next build)
      'server-only': fromRoot('./tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    testTimeout: 15_000,
  },
});
