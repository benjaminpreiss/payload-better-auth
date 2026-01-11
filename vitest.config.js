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
    },
  }
})
