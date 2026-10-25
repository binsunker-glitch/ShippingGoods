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
  /**
   * PGlite resolves its WASM binary relative to its own module URL; bundling it
   * with Turbopack breaks that resolution (`path ... Received an instance of
   * URL`). `pg` ships native sockets and is on Next's default external list.
   */
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
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
