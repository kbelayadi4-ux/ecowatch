import { supabase } from "./supabase";
import { Agent } from "./types";

/**
 * Get current authenticated user's agent profile
 */
export async function getCurrentAgent(): Promise<Agent | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, telephone: data.telephone, nom: data.nom, role: data.role };
}

/**
 * Sign in with phone number (OTP)
 * Uses Supabase's signInWithOtp which sends SMS OTP
 */
export async function signInWithPhone(phone: string): Promise<{ error: string | null }> {
  const normalizedPhone = phone.replace(/\s/g, "").replace(/^216/, "");
  const { error } = await supabase.auth.signInWithOtp({
    phone: `+216${normalizedPhone}`,
  });
  return { error: error?.message ?? null };
}

/**
 * Verify OTP code
 */
export async function verifyOtp(phone: string, token: string): Promise<{ error: string | null }> {
  const normalizedPhone = phone.replace(/\s/g, "").replace(/^216/, "");
  const { error } = await supabase.auth.verifyOtp({
    phone: `+216${normalizedPhone}`,
    token,
    type: "sms",
  });
  return { error: error?.message ?? null };
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback: (agent: Agent | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      const agent = await getCurrentAgent();
      callback(agent);
    } else if (event === "SIGNED_OUT") {
      callback(null);
    }
  });
  return () => subscription.unsubscribe();
}

/**
 * Check if current user is admin.
 *
 * Source de verite : `public.agents.role`, relayee par `getCurrentAgent()`.
 * `app_metadata.role` n'est qu'un cache d'affichage : il ne doit jamais
 * servir a autoriser une action (voir supabase/migrations/008).
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const agent = await getCurrentAgent();
  return agent?.role === "admin";
}
