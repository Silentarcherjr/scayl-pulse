import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Separate frontend suite: does not change core or integrations test ownership.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) } },
  test: { environment: 'node', include: ['src/components/frontend-tests/**/*.test.ts'] },
});
