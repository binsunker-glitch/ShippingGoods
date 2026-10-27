/**
 * Central access to the Supabase project configuration.
 *
 * The publishable key is the *client-side* (anon) key — it is safe to expose in
 * the browser and is protected by Row Level Security. The service-role / secret
 * key is deliberately NOT read here and must never reach client code.
 *
 * These values come from environment variables (see `.env.example`); they are
 * never hardcoded into source files.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    // Surfaced at request time; the app renders a clear configuration error
    // rather than silently misbehaving.
    throw new Error(
      `Missing Supabase configuration: ${name}. Set it in your environment (see .env.example).`,
    );
  }
  return value.trim();
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabasePublishableKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

/** True when the Supabase project URL + publishable key are both present. */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}
