import { supabase } from "./supabase";
import { getObservations as lsGet, saveObservation as lsSave } from "./store";
import { Observation } from "./types";

export async function fetchObservations(): Promise<Observation[]> {
  if (supabase) {
    const { data, error } = await supabase.from("observations").select("*").order("date_creation", { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      numeroSuivi: r.numero_suivi,
      agentId: r.agent_id,
      agentNom: r.agent_nom,
      agentTelephone: r.agent_telephone,
      typeProbleme: r.type_probleme,
      commentaire: r.commentaire || "",
      zone: r.zone,
      photo: r.photo,
      dateCreation: r.date_creation,
      partage: r.partage,
      statut: r.statut,
      priorite: r.priorite,
      responsable: r.responsable,
      echeance: r.echeance,
      analyseCause: r.analyse_cause,
      mesuresImmediates: r.mesures_immediates,
      actionsCorrectives: r.actions_correctives,
      dateRealisation: r.date_realisation,
      verificationEfficacite: r.verification_efficacite,
      commentaires: r.commentaires || [],
      piecesJointes: r.pieces_jointes || [],
      historique: r.historique || [],
    }));
  }
  return lsGet();
}

export async function createObservation(obs: Observation): Promise<Observation> {
  if (supabase) {
    const { error } = await supabase.from("observations").insert({
      id: obs.id,
      numero_suivi: obs.numeroSuivi,
      agent_id: obs.agentId,
      agent_nom: obs.agentNom,
      agent_telephone: obs.agentTelephone,
      type_probleme: obs.typeProbleme,
      commentaire: obs.commentaire,
      zone: obs.zone,
      photo: obs.photo,
      date_creation: obs.dateCreation,
      partage: obs.partage,
      statut: obs.statut,
      priorite: obs.priorite,
      commentaires: obs.commentaires,
      pieces_jointes: obs.piecesJointes,
      historique: obs.historique,
    });
    if (error) throw error;
    return obs;
  }
  const r = lsSave(obs);
  if (!r.ok) throw new Error(r.erreur || "stockage_plein");
  return obs;
}

export async function updateObservation(id: string, patch: Partial<Observation>): Promise<void> {
  if (supabase) {
    const row: any = {};
    if (patch.statut !== undefined) row.statut = patch.statut;
    if (patch.priorite !== undefined) row.priorite = patch.priorite;
    if (patch.responsable !== undefined) row.responsable = patch.responsable;
    if (patch.echeance !== undefined) row.echeance = patch.echeance;
    if (patch.analyseCause !== undefined) row.analyse_cause = patch.analyseCause;
    if (patch.mesuresImmediates !== undefined) row.mesures_immediates = patch.mesuresImmediates;
    if (patch.actionsCorrectives !== undefined) row.actions_correctives = patch.actionsCorrectives;
    if (patch.dateRealisation !== undefined) row.date_realisation = patch.dateRealisation;
    if (patch.verificationEfficacite !== undefined) row.verification_efficacite = patch.verificationEfficacite;
    if (patch.commentaires !== undefined) row.commentaires = patch.commentaires;
    if (patch.historique !== undefined) row.historique = patch.historique;
    const { error } = await supabase.from("observations").update(row).eq("id", id);
    if (error) throw error;
    return;
  }
  const list = lsGet();
  const idx = list.findIndex((o) => o.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    localStorage.setItem("eco_observations", JSON.stringify(list));
  }
}

export async function migrateLocalToSupabase(): Promise<{ total: number; imported: number; skipped: number; errors: number }> {
  if (!supabase) throw new Error("Supabase non configuré");
  const local = lsGet();
  let imported = 0, skipped = 0, errors = 0;
  for (const obs of local) {
    const { data: existing } = await supabase.from("observations").select("id").eq("id", obs.id).maybeSingle();
    if (existing) { skipped++; continue; }
    try {
      await createObservation(obs);
      imported++;
    } catch {
      errors++;
    }
  }
  return { total: local.length, imported, skipped, errors };
}
