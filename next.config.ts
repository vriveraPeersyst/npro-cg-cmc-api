import type { NextConfig } from "next";

const SECURITY_HEADERS = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-XSS-Protection", value: "1; mode=block" },
    { key: "Referrer-Policy", value: "no-referrer" },
];

// CORS headers previously served by vercel.json. Preserved here so behaviour does not regress
// when leaving Vercel for Railway. Cache-Control is intentionally NOT set here: each route owns
// its own caching strategy.
const CORS_HEADERS = [
    { key: "Access-Control-Allow-Origin", value: "*" },
    { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
];

const nextConfig: NextConfig = {
    // Standalone output produces a self-contained server bundle for the Railway Docker image.
    output: "standalone",
    // Keep pino out of the webpack bundle: it loads its transports via dynamic requires that the
    // bundler cannot statically resolve, so bundling it breaks JSON logging in the standalone runtime.
    serverExternalPackages: ["pino"],
    reactStrictMode: true,
    // Remove the `X-Powered-By: Next.js` header (security).
    poweredByHeader: false,
    async headers() {
        return [
            {
                source: "/:path*",
                headers: SECURITY_HEADERS,
            },
            {
                source: "/api/:path*",
                headers: CORS_HEADERS,
            },
        ];
    },
};

export default nextConfig;
