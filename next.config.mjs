/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.68.52'],
  serverExternalPackages: [],
  // extensionAlias is needed for buf-generated proto files that import .pb.js but the actual files are .ts
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    }
    return config
  },
}

export default nextConfig
