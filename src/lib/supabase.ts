import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  client = createClient(url as string, key as string, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
} else if (typeof window !== "undefined") {
  console.error("Supabase env vars manquantes : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = client as SupabaseClient;
