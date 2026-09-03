// API_PROXY_TARGET: default "http://backend:8081" (Docker Compose service DNS,
// benar utk deploy/staging-server/production). Override lewat .env.local
// (gitignored) kalau jalanin frontend LANGSUNG di host (npm run dev, bukan
// Docker) -- di situ "backend" tidak resolvable, perlu localhost:<port
// backend lokal>.
const backendTarget = process.env.API_PROXY_TARGET || "http://backend:8081";
console.log(`>>> Next.js rewrites loaded, backend: ${backendTarget} <<<`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
