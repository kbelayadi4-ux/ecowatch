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
 */
export async function signInWithPhone(phone: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: `+216${phone.replace(/\s/g, "").replace(/^216/, "")}`,
  });
  return { error: error?.message ?? null };
}

/**
 * Sign in with email (OTP)
 */
export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ email });
  return { error: error?.message ?? null };
}

/**
 * Sign up new agent (creates Auth user + agent profile via trigger)
 * Note: Actual profile creation happens after email/phone verification
 */
export async function signUpAgent(phone: string, nom: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: `+216${phone.replace(/\s/g, "").replace(/^216/, "")}`,
    options: {
      data: { nom, role: "agent" },
    },
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
 * Check if current user is admin
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  return user.app_metadata?.role === "admin";
}
