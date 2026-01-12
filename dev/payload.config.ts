// storage-adapter-import-placeholder
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { betterAuthPayloadPlugin } from 'payload-better-auth'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter'
import { eventBus } from './lib/eventBus'
import { storage } from './lib/syncAdapter'

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
    // Custom users collection - will be auto-extended by betterAuthPayloadPlugin
    {
      slug: 'users',
      admin: {
        defaultColumns: ['email', 'name', 'createdAt'],
        useAsTitle: 'email',
      },
      fields: [
        {
          name: 'email',
          type: 'email',
          required: true,
          // Email cannot be updated by users (only BA sync agent can update)
          access: {
            update: () => false,
          },
        },
        {
          name: 'name',
          type: 'text',
          // Users can update their own name
          access: {
            update: ({ req }) => Boolean(req.user),
          },
        },
      ],
      // Custom access rules - BA sync access is automatically OR'd with these
      access: {
        read: ({ req }) => Boolean(req.user), // authenticated users can read
        // Users can only update their own record
        update: ({ req }) => {
          if (!req.user) {
            return false
          }
          // Return a query constraint: user can only update docs where id matches their own
          return { id: { equals: req.user.id } }
        },
      },
    },
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
      url: process.env.DATABASE_URI || 'file:./payload.db',
    },
    migrationDir: path.resolve(dirname, 'migrations'),
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
      collectionPrefix: '__better_auth', // optional, this is the default
      debug: true,
      eventBus, // Shared with Better Auth plugin
      storage, // Shared with Better Auth plugin
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
