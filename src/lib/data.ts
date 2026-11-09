import { supabase } from "./supabase";
import { Observation } from "./types";

export async function getObservations(): Promise<Observation[]> {
  const { data, error } = await supabase
    .from("observations")
    .select("*")
    .order("date_creation", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    agentId: r.agent_id,
    agentNom: r.agent_nom,
    agentTelephone: r.agent_telephone,
    typeProbleme: r.type_probleme,
    commentaire: r.commentaire ?? "",
    zone: r.zone,
    photo: r.photo ?? undefined,
    dateCreation: r.date_creation,
    partage: r.partage ?? false,
  }));
}

export async function saveObservation(obs: Observation): Promise<{ ok: boolean; erreur?: string }> {
  const { error } = await supabase.from("observations").insert({
    id: obs.id,
    agent_id: obs.agentId,
    agent_nom: obs.agentNom,
    agent_telephone: obs.agentTelephone,
    type_probleme: obs.typeProbleme,
    commentaire: obs.commentaire,
    zone: obs.zone,
    photo: obs.photo ?? null,
    date_creation: obs.dateCreation,
    partage: obs.partage,
  });
  if (error) return { ok: false, erreur: error.message };
  await supabase.from("notifs").insert({
    id: `n-${obs.id}`,
    obs_id: obs.id,
    agent_nom: obs.agentNom,
    type_probleme: obs.typeProbleme,
    zone: obs.zone,
    date_creation: obs.dateCreation,
  });
  return { ok: true };
}

export async function getObservationsByAgent(agentId: string): Promise<Observation[]> {
  const all = await getObservations();
  return all.filter((o) => o.agentId === agentId);
}

export async function getNotifs(): Promise<any[]> {
  const { data, error } = await supabase
    .from("notifs")
    .select("*")
    .order("date_creation", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    obsId: r.obs_id,
    agentNom: r.agent_nom,
    typeProbleme: r.type_probleme,
    zone: r.zone,
    dateCreation: r.date_creation,
    lu: r.lu,
  }));
}

export async function getNotifsNonLues(): Promise<number> {
  const notifs = await getNotifs();
  return notifs.filter((n: any) => !n.lu).length;
}

export async function marquerToutLu(): Promise<void> {
  await supabase.from("notifs").update({ lu: true }).eq("lu", false);
}

export async function marquerNotifLu(obsId: string): Promise<void> {
  await supabase.from("notifs").update({ lu: true }).eq("obs_id", obsId);
}

export async function marquerNotifNonLu(obsId: string): Promise<void> {
  await supabase.from("notifs").update({ lu: false }).eq("obs_id", obsId);
}
