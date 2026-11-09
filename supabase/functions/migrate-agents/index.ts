/**
 * Edge Function: migrate-agents
 * Creates Supabase Auth users for existing agents and links them via auth_user_id.
 * 
 * Usage: POST /functions/v1/migrate-agents
 * Body: { "adminSecret": "SERVICE_ROLE_KEY" }  -- or use Authorization header
 * 
 * Run ONCE after 001 migration is applied and before 003.
 * 
 * Security: Requires service_role key. Never expose in frontend.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentRecord {
  id: string;
  telephone: string;
  nom: string;
  role: "agent" | "admin";
  auth_user_id: string | null;
}

interface RequestBody {
  adminSecret?: string;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { adminSecret } = (await req.json()) as RequestBody;
    
    // Verify service role key (passed via header or body)
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceRoleKey = adminSecret ?? authHeader.replace("Bearer ", "");
    
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Service role key required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch all agents without auth_user_id
    const { data: agents, error: agentsError } = await supabase
      .from("agents")
      .select("id, telephone, nom, role, auth_user_id")
      .is("auth_user_id", null);

    if (agentsError) throw agentsError;
    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No agents to migrate", 
        migrated: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ agentId: string; telephone: string; authUserId: string | null; error: string | null }> = [];
    let migrated = 0;
    let failed = 0;

    for (const agent of agents as AgentRecord[]) {
      try {
        // Format phone for Supabase Auth (E.164)
        const phone = `+216${agent.telephone}`;

        // Create user in Supabase Auth with random password
        // Admin will send magic link OTP for actual login
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          phone,
          phone_confirm: true, // Mark as confirmed since we're migrating existing users
          user_metadata: {
            role: agent.role,
            nom: agent.nom,
            migrated: true,
          },
        });

        if (authError) throw authError;

        const authUserId = authData.user?.id;
        if (!authUserId) throw new Error("No user ID returned");

        // Update agent with auth_user_id
        const { error: updateError } = await supabase
          .from("agents")
          .update({ auth_user_id: authUserId })
          .eq("id", agent.id);

        if (updateError) throw updateError;

        results.push({ agentId: agent.id, telephone: agent.telephone, authUserId, error: null });
        migrated++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ agentId: agent.id, telephone: agent.telephone, authUserId: null, error: msg });
        failed++;
      }
    }

    return new Response(JSON.stringify({ 
      message: `Migration complete: ${migrated} succeeded, ${failed} failed`,
      migrated,
      failed,
      details: results,
    }), {
      status: failed === 0 ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
