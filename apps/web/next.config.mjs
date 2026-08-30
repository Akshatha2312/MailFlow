/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mailflow/shared'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
