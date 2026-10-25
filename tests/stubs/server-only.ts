/**
 * Vitest stub for the `server-only` package. In the real app it throws when a
 * server module leaks into the client bundle; tests run in Node, where that
 * guarantee does not apply.
 */
export {};
