import { withPayload } from '@payloadcms/next/withPayload'
import { fileURLToPath } from 'url'
import path from 'path'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the src folder for HMR support
  transpilePackages: ['payload-better-auth'],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    // Alias payload-better-auth imports to src folder for HMR
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      'payload-better-auth/client': path.resolve(dirname, '../src/exports/client.ts'),
      'payload-better-auth/rsc': path.resolve(dirname, '../src/exports/rsc.ts'),
      'payload-better-auth': path.resolve(dirname, '../src/index.ts'),
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
