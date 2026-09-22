const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * Next injects its bootstrap and hydration payload as inline <script> tags, and
 * Tailwind ships styles inline, so 'unsafe-inline' is required for both — a
 * static-HTML CSP with script-src 'self' alone would break hydration. Dev
 * additionally needs 'unsafe-eval' for React Refresh. Everything else is locked
 * to same-origin: the app has no third-party scripts, fonts or images, and talks
 * only to its own /api routes (Neon is queried server-side, never from the page).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // The app holds personal training data — keep it out of search indexes.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
