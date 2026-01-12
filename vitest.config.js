import path from 'path'
import { loadEnv } from 'payload/node'
import { fileURLToPath } from 'url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(() => {
  loadEnv(path.resolve(dirname, './dev'))

  return {
    plugins: [
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
    ],
    test: {
      environment: 'node',
      hookTimeout: 30_000,
      testTimeout: 30_000,
      include: ['dev/tests/int/**/*.int.spec.ts'],
      exclude: ['dev/tests/e2e/**/*.e2e.spec.ts'],
      // Run tests sequentially to avoid SQLite database locking issues
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,
        },
      },
      // Also ensure test files run sequentially
      fileParallelism: false,
      // Use separate SQLite files for tests (storage + event bus)
      env: {
        SYNC_STATE_DB_PATH: './dev/tests/test-sync-state.db',
        EVENT_BUS_DB_PATH: './dev/tests/test-event-bus.db',
      },
    },
  }
})
