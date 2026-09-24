import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PublicError } from "@/src/lib/errors";

export function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new PublicError(
      "SUPABASE_CONFIG_MISSING",
      "Supabase is not configured. Add the URL and publishable key to .env.",
      500,
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
