/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Emit a directory-per-route layout (out/map/index.html) instead of flat
  // out/map.html, so the CloudFront OAC directory-index rewrite resolves clean
  // routes like /map → /map/index.html (infra/30-frontend, design.md §5).
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
