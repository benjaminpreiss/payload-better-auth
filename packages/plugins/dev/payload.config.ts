// storage-adapter-import-placeholder
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { betterAuthPayloadPlugin } from 'payload-better-auth'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      slug: 'posts',
      fields: [],
    },
    {
      slug: 'media',
      fields: [],
      upload: {
        staticDir: path.resolve(dirname, 'media'),
      },
    },
  ],
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./payload-and-frontend.db',
    },
  }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  plugins: [
    betterAuthPayloadPlugin({
      betterAuthClientOptions: {
        // In local development, internal and external URLs are typically the same
        externalBaseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
        internalBaseURL: process.env.INTERNAL_SERVER_URL || 'http://localhost:3000',
      },
      reconcileToken: process.env.RECONCILE_TOKEN,
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
