/**
 * Edge Function: migrate-agents
 * Creates Supabase Auth users for existing agents and links them via auth_user_id.
 * 
 * Usage: POST /functions/v1/migrate-agents
 * Header: Authorization: Bearer <SERVICE_ROLE_KEY>
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
    // Verify service role key from Authorization header
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceRoleKey = authHeader.replace("Bearer ", "").trim();
    
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Service role key required in Authorization header" }), {
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
    let skipped = 0;

    for (const agent of agents as AgentRecord[]) {
      try {
        // Format phone for Supabase Auth (E.164)
        const phone = `+216${agent.telephone}`;

        // Check if user already exists in Auth (by phone)
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers.users.find(u => u.phone === phone);
        
        let authUserId: string;
        
        if (existingUser) {
          authUserId = existingUser.id;
          // Update app_metadata.role if needed
          await supabase.auth.admin.updateUserById(authUserId, {
            app_metadata: { role: agent.role }
          });
          results.push({ agentId: agent.id, telephone: agent.telephone, authUserId, error: "User already existed, role updated" });
          skipped++;
        } else {
          // Create user in Supabase Auth with phone NOT confirmed (requires OTP verification)
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            phone,
            phone_confirm: false, // Require OTP verification on first login
            user_metadata: {
              nom: agent.nom,
              migrated: true,
            },
            app_metadata: {
              role: agent.role,
            },
          });

          if (authError) throw authError;

          authUserId = authData.user?.id;
          if (!authUserId) throw new Error("No user ID returned");
        }

        // Update agent with auth_user_id (idempotent - won't overwrite if already set)
        const { error: updateError } = await supabase
          .from("agents")
          .update({ auth_user_id: authUserId })
          .eq("id", agent.id)
          .is("auth_user_id", null); // Only update if not already linked

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
      message: `Migration complete: ${migrated} created, ${skipped} updated, ${failed} failed`,
      migrated,
      skipped,
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
