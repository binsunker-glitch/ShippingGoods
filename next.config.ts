import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  /**
   * Auth-gated segments (portal + admin) legitimately block on the session, and
   * the embedded PGlite driver reads Date.now() internally — validating them
   * produces only false positives. Validate only segments that opt in with
   * `export const instant`; dev-only, production output is unaffected.
   */
  experimental: {
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  /* No native/database drivers are bundled: the app talks to Supabase over
   * HTTPS with supabase-js (@supabase/ssr keeps it server-only). */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
