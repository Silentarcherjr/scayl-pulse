import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // La suite de frontend vive junto a sus componentes y traía su propio
    // config, así que `verify` y CI no la ejecutaban: una regresión de la
    // interfaz pasaba sin que nadie se enterase. Un único include las cubre.
    include: ['tests/**/*.test.ts', 'src/components/frontend-tests/**/*.test.ts'],
    env: {
      // Tests must be reproducible and must never call a paid API.
      SCAYL_FORCE_IN_MEMORY: 'true',
      SCAYL_FORCE_FIXTURE_AI: 'true',
    },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
