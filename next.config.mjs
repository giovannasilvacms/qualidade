/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false, // source maps desligados: nada de código interno exposto
  images: { formats: ['image/avif', 'image/webp'] },
};
export default nextConfig;
