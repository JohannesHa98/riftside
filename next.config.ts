import type { NextConfig } from "next";

const inDevelopment = process.env.NODE_ENV === "development";

/**
 * What the browser is allowed to load, and from where.
 *
 * Scripts and styles need `unsafe-inline` because Next inlines its own
 * bootstrap and the theme script runs before React to stop the page flashing
 * white. That is the honest limit of this policy: it does not stop injected
 * inline script. What it does stop is script, styles or data coming from
 * anywhere we did not name — so an injection cannot pull in a payload or send
 * anything out. React escapes everything it renders and nothing here puts
 * user-supplied HTML on a page, which is what actually covers the gap.
 *
 * A nonce would close it properly, but a nonce has to be generated per
 * request, and that makes every page dynamic — which would cost the partial
 * prerendering the whole site is built around. Not a trade worth making for
 * a site that renders no untrusted markup.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Turbopack serves modules through eval while developing.
  `script-src 'self' 'unsafe-inline'${inDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Champion portraits come straight from Community Dragon.
  "img-src 'self' data: https://cdn.communitydragon.org",
  "font-src 'self' data:",
  // The dev server's hot reload talks over a websocket.
  `connect-src 'self'${inDevelopment ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nobody frames this site. Signing in lasts thirty days, and every delete
  // is one click behind that session — which is exactly what clickjacking is
  // for.
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // frame-ancestors covers this for anything current; this is for the rest.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // dpm.lol gets told we sent you, not which player's page you came from.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Champion portraits, looked up by the numeric id the client gives us.
      { protocol: "https", hostname: "cdn.communitydragon.org" },
    ],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
