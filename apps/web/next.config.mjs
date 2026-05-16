/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bandari/shared"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
