import { supabase } from "./supabase";
import { Agent } from "./types";

export async function getAgentByPhone(telephone: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("telephone", telephone)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, telephone: data.telephone, nom: data.nom, role: data.role };
}

export async function saveAgent(agent: Agent): Promise<void> {
  await supabase.from("agents").upsert({
    id: agent.id,
    telephone: agent.telephone,
    nom: agent.nom,
    role: agent.role,
  });
}
