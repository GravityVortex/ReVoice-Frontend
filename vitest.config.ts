import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Vitest doesn't automatically honor TS `paths` from tsconfig.
// Keep this minimal: just mirror the `@/* -> ./src/*` alias used across the codebase.
export default defineConfig({
  resolve: {
    alias: [
      // Must be more specific than `@` so it doesn't get shadowed.
      { find: '@/.source', replacement: path.resolve(__dirname, '.source.next/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
});

