import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the src folder for HMR support
  transpilePackages: ['payload-better-auth'],
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
