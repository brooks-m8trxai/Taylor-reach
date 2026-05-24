/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@taylor-reach/db',
    '@taylor-reach/compliance',
    '@taylor-reach/agents',
    '@taylor-reach/pitch',
    '@taylor-reach/signals',
    '@taylor-reach/enrichment',
    '@taylor-reach/integrations',
  ],
}

export default nextConfig
