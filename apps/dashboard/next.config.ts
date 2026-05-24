import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages export raw TypeScript — Next.js must transpile them via SWC.
  transpilePackages: [
    '@taylor-reach/db',
    '@taylor-reach/signals',
    '@taylor-reach/enrichment',
    '@taylor-reach/pitch',
    '@taylor-reach/agents',
    '@taylor-reach/compliance',
    '@taylor-reach/integrations',
  ],
}

export default nextConfig
