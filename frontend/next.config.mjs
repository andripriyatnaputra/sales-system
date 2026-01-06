console.log(">>> Next.js rewrites loaded, backend:8081 <<<");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8081/api/:path*",
      },
    ];
  },
};

export default nextConfig;
