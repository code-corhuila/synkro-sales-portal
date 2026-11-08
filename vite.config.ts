import { fileURLToPath } from 'node:url'
import federation from '@originjs/vite-plugin-federation'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { createFederationConfig } from './src/federation.config.ts'

const double = (file: string) => fileURLToPath(new URL(`./src/test-doubles/${file}`, import.meta.url))

export default defineConfig(({ mode }) => {
  const { VITE_SHELL_ENTRY_URL, VITE_BASE_PATH } = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    base: VITE_BASE_PATH || '/',
    // Under Vitest (mode "test") the federation plugin would rewrite the shell
    // imports into remote URLs, so tests alias them to fakes instead.
    plugins: [react(), ...(mode === 'test' ? [] : [federation(createFederationConfig(VITE_SHELL_ENTRY_URL || undefined))])],
    build: {
      target: 'esnext',
      modulePreload: false,
      cssCodeSplit: false,
      // The federation plugin rewrites its css placeholders only inside '' or "" quotes,
      // and the minifier writes them as template literals, so the remote entry breaks
      // without this. Revisit when the plugin or the bundler changes.
      minify: false,
      // Unminified output keeps the JSDoc blocks of dependencies. pdf-lib documents its API with examples that
      // contain `fetch(url)`, which the compiled-boundary check (scripts/compiledCheck.mjs) would read as real
      // transport. Strip JSDoc only: legal and annotation comments are kept.
      rolldownOptions: { output: { comments: { jsdoc: false } } },
    },
    preview: { port: 5176, strictPort: true },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test-setup.ts',
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test-doubles/**', 'src/test-setup.ts', 'src/**/*.d.ts'],
        reporter: ['text', 'lcov'],
        // Frontend floor from the team's testing strategy: 70% of statements.
        thresholds: { statements: 70, 'src/sales/**': { statements: 70 } },
      },
      alias: {
        'shell/apiClient': double('shellApiClient.ts'),
        'shell/session': double('shellSession.ts'),
      },
    },
  }
})
