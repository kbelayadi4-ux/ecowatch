import { supabase, isSupabaseConfigured } from "./supabase";
import { TAILLE_MAX_BUCKET } from "./store";
import {
  Agent,
  EvenementSuivi,
  FiltresObservations,
  Kpis,
  Observation,
  PageObservations,
  Priorite,
  StatutObservation,
  TypeProbleme,
  ZoneUsine,
} from "./types";

/**
 * Couche d'accès aux données Supabase.
 *
 * Règles :
 *  - Supabase est la seule source de vérité des données partagées.
 *  - Aucune écriture directe : les mises à jour de suivi passent par la
 *    fonction `public.admin_update_observation` (migration 009), qui vérifie
 *    le rôle administrateur côté serveur.
 *  - Le client ne fournit jamais l'identité de l'agent : la base l'impose.
 */

type Row = Record<string, unknown>;

function exigerClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Configuration Supabase manquante : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return supabase;
}

function fromRow(r: Row): Observation {
  return {
    id: String(r.id),
    numeroSuivi: (r.numero_suivi as string) ?? "",
    agentId: String(r.agent_id ?? ""),
    agentNom: (r.agent_nom as string) ?? "",
    agentTelephone: (r.agent_telephone as string) ?? "",
    typeProbleme: r.type_probleme as TypeProbleme,
    commentaire: (r.commentaire as string) ?? "",
    zone: r.zone as ZoneUsine,
    photo: (r.photo as string) ?? undefined,
    photoPath: (r.photo_path as string) ?? undefined,
    dateCreation: String(r.date_creation ?? ""),
    partage: Boolean(r.partage),
    statut: (r.statut as StatutObservation) ?? "nouvelle",
    priorite: (r.priorite as Priorite) ?? "normale",
    assigneA: (r.assigne_a as string) ?? null,
    echeance: (r.echeance as string) ?? null,
    dateCloture: (r.date_cloture as string) ?? null,
    majLe: String(r.maj_le ?? ""),
  };
}

/** Neutralise les caractères qui casseraient un filtre PostgREST. */
function assainir(texte: string): string {
  return texte.replace(/[,()%\\]/g, " ").trim();
}

function appliquerFiltres(requete: any, filtres: FiltresObservations) {
  let q = requete;
  if (filtres.statut) q = q.eq("statut", filtres.statut);
  if (filtres.priorite) q = q.eq("priorite", filtres.priorite);
  if (filtres.zone) q = q.eq("zone", filtres.zone);
  if (filtres.type) q = q.eq("type_probleme", filtres.type);
  if (filtres.agentId) q = q.eq("agent_id", filtres.agentId);
  if (filtres.enRetardSeulement) {
    q = q.lt("echeance", new Date().toISOString()).neq("statut", "cloturee");
  }
  const recherche = assainir(filtres.recherche ?? "");
  if (recherche) {
    q = q.or(
      `numero_suivi.ilike.%${recherche}%,agent_nom.ilike.%${recherche}%,commentaire.ilike.%${recherche}%`,
    );
  }
  return q;
}

export async function getObservationsPage(
  filtres: FiltresObservations = {},
  page = 0,
  taillePage = 20,
): Promise<PageObservations> {
  const client = exigerClient();
  const debut = page * taillePage;
  const { data, error, count } = await appliquerFiltres(
    client.from("observations").select("*", { count: "exact" }),
    filtres,
  )
    .order("date_creation", { ascending: false })
    .range(debut, debut + taillePage - 1);

  if (error) throw error;
  return { lignes: (data ?? []).map(fromRow), total: count ?? 0 };
}

export async function getObservations(): Promise<Observation[]> {
  const client = exigerClient();
  const { data, error } = await client
    .from("observations")
    .select("*")
    .order("date_creation", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function getObservationsByAgent(agentId: string): Promise<Observation[]> {
  const client = exigerClient();
  const { data, error } = await client
    .from("observations")
    .select("*")
    .eq("agent_id", agentId)
    .order("date_creation", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

/** Compteurs du tableau de bord (une requête agrégée par statut). */
export async function getKpis(): Promise<Kpis> {
  const client = exigerClient();

  const compte = async (build: (q: any) => any) => {
    const { count, error } = await build(
      client.from("observations").select("id", { count: "exact", head: true }),
    );
    if (error) throw error;
    return count ?? 0;
  };

  const maintenant = new Date().toISOString();

  const [total, nouvelles, enAnalyse, actionCours, attente, enRetard, cloturees] =
    await Promise.all([
      compte((q) => q),
      compte((q) => q.eq("statut", "nouvelle")),
      compte((q) => q.eq("statut", "en_analyse")),
      compte((q) => q.eq("statut", "action_en_cours")),
      compte((q) => q.eq("statut", "attente_verification")),
      compte((q) => q.lt("echeance", maintenant).neq("statut", "cloturee")),
      compte((q) => q.eq("statut", "cloturee")),
    ]);

  return {
    total,
    nouvelles,
    enCours: enAnalyse + actionCours + attente,
    enRetard,
    cloturees,
  };
}

export async function getHistorique(observationId: string): Promise<EvenementSuivi[]> {
  const client = exigerClient();
  const { data, error } = await client
    .from("observation_history")
    .select("id, action, auteur_nom, auteur_role, resume, cree_le")
    .eq("observation_identifiant", observationId)
    .order("cree_le", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id),
    action: r.action as EvenementSuivi["action"],
    auteurNom: (r.auteur_nom as string) ?? null,
    auteurRole: (r.auteur_role as string) ?? null,
    resume: (r.resume as string) ?? null,
    creeLe: String(r.cree_le ?? ""),
  }));
}

export interface MiseAJourSuivi {
  statut?: StatutObservation;
  priorite?: Priorite;
  /** `""` désaffecte le responsable, `null` ne change rien. */
  assigneA?: string | null;
  echeance?: string | null;
  /** `true` efface l'échéance ; sinon `null` ne change rien. */
  effacerEcheance?: boolean;
  commentaire?: string;
}

export async function updateObservation(
  observationId: string,
  mise: MiseAJourSuivi,
): Promise<{ ok: boolean; erreur?: string }> {
  const client = exigerClient();
  const { error } = await client.rpc("admin_update_observation", {
    p_id: observationId,
    p_statut: mise.statut ?? null,
    p_priorite: mise.priorite ?? null,
    p_assigne_a: mise.assigneA ?? null,
    p_echeance: mise.echeance ?? null,
    p_commentaire: mise.commentaire ?? null,
    p_effacer_echeance: mise.effacerEcheance ?? false,
  });
  if (error) return { ok: false, erreur: error.message };
  return { ok: true };
}

/**
 * Corps d'insertion pour une base sur laquelle la migration 009 est appliquée.
 * `numero_suivi` est volontairement absent : il est genere par la base.
 */
export function payloadObservation(obs: Observation): Record<string, unknown> {
  return {
    id: obs.id,
    agent_id: obs.agentId,
    agent_nom: obs.agentNom,
    agent_telephone: obs.agentTelephone,
    type_probleme: obs.typeProbleme,
    commentaire: obs.commentaire,
    zone: obs.zone,
    photo: obs.photo ?? null,
    photo_path: obs.photoPath ?? null,
    date_creation: obs.dateCreation,
    partage: obs.partage,
    statut: obs.statut || "nouvelle",
    priorite: obs.priorite || "normale",
  };
}

/**
 * Corps d'insertion compatible avec une base où la migration 009 n'est pas
 * encore appliquée (colonnes de suivi et photo_path absentes).
 */
export function payloadObservationLegacy(obs: Observation): Record<string, unknown> {
  return {
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
  };
}

export interface ResultatEnregistrement {
  ok: boolean;
  erreur?: string;
  /** Vrai si l'insertion a necessité le repli « schéma avant 009 ». */
  modeDeprecie?: boolean;
}

/** Vrai si l'erreur indique une base où la migration 009 n'est pas appliquée. */
export function estErreurSchemaAncien(message: string): boolean {
  return /column .* does not exist|schema cache|could not find the "/i.test(message);
}

/**
 * Enregistre une observation.
 *
 * Deux difficultés connues, désormais traitées explicitement :
 *  1. une base où la migration 009 n'est pas encore appliquée renvoie
 *     « column "statut" does not exist » : on bascule alors sur le schéma
 *     historique plutôt que d'échouer ;
 *  2. toute erreur est renvoyée avec son message technique, pour être
 *     affichée à l'utilisateur et journalisée.
 */
export async function saveObservation(obs: Observation): Promise<ResultatEnregistrement> {
  const client = exigerClient();

  const premiere = await client.from("observations").insert(payloadObservation(obs));
  if (!premiere.error) return { ok: true };

  const message = premiere.error.message ?? "";
  if (!estErreurSchemaAncien(message)) {
    return { ok: false, erreur: message };
  }

  const repli = await client.from("observations").insert(payloadObservationLegacy(obs));
  if (repli.error) {
    return { ok: false, erreur: repli.error.message ?? message };
  }
  return { ok: true, modeDeprecie: true };
}

// ── Notifications ─────────────────────────────────────────────

export interface Notif {
  id: string;
  obsId: string;
  agentNom: string;
  typeProbleme: string;
  zone: string;
  dateCreation: string;
  lu: boolean;
}

function notifFromRow(r: Row): Notif {
  return {
    id: String(r.id ?? `${r.obs_id}`),
    obsId: String(r.obs_id),
    agentNom: (r.agent_nom as string) ?? "",
    typeProbleme: (r.type_probleme as string) ?? "autre",
    zone: (r.zone as string) ?? "usine",
    dateCreation: String(r.date_creation ?? ""),
    lu: Boolean(r.lu),
  };
}

export async function getNotifs(): Promise<Notif[]> {
  const client = exigerClient();
  const { data, error } = await client
    .from("notifs")
    .select("id, obs_id, agent_nom, type_probleme, zone, date_creation, lu")
    .order("date_creation", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(notifFromRow);
}

export async function getNotifsNonLues(): Promise<number> {
  const client = exigerClient();
  const { count, error } = await client
    .from("notifs")
    .select("id", { count: "exact", head: true })
    .eq("lu", false);
  if (error) throw error;
  return count ?? 0;
}

export async function marquerToutLu(): Promise<void> {
  const client = exigerClient();
  const { error } = await client.from("notifs").update({ lu: true }).eq("lu", false);
  if (error) throw error;
}

export async function marquerNotifLu(notifId: string): Promise<void> {
  const client = exigerClient();
  const { error } = await client.from("notifs").update({ lu: true }).eq("id", notifId);
  if (error) throw error;
}

export async function marquerNotifNonLu(notifId: string): Promise<void> {
  const client = exigerClient();
  const { error } = await client.from("notifs").update({ lu: false }).eq("id", notifId);
  if (error) throw error;
}

// ── Agents (administration) ───────────────────────────────────

export async function getAgentsAdmin(): Promise<Agent[]> {
  const client = exigerClient();
  const { data, error } = await client
    .from("agents")
    .select("id, telephone, nom, role, auth_user_id")
    .order("nom", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Row) => ({
    id: String(r.id),
    telephone: String(r.telephone ?? ""),
    nom: String(r.nom ?? ""),
    role: (r.role as Agent["role"]) ?? "agent",
  }));
}

export async function setRoleAgent(
  telephone: string,
  role: "agent" | "admin",
): Promise<{ ok: boolean; erreur?: string }> {
  const client = exigerClient();
  const { error } = await client.rpc("admin_set_role", { p_phone: telephone, p_role: role });
  if (error) return { ok: false, erreur: error.message };
  return { ok: true };
}

// ── Photographies (Supabase Storage) ──────────────────────────

export const BUCKET_PHOTOS = "photos";

function dataUrlVersBlob(dataUrl: string): { blob: Blob; extension: string } {
  const [entete, contenu] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(entete)?.[1] ?? "image/jpeg";
  const binaire = atob(contenu);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return { blob: new Blob([octets], { type: mime }), extension };
}

/**
 * Téléverse une photo dans le bucket privé `photos`.
 * Chemin : <agent_id>/<observation_id>.<ext>
 *
 * Ne lève jamais : en cas d'échec, l'erreur est renvoyée pour être affichée
 * et journalisée, et l'appelant conserve l'image dans la base (colonne photo)
 * afin de ne jamais perdre un signalement.
 */
export async function televerserPhoto(
  agentId: string,
  observationId: string,
  dataUrl: string,
): Promise<{ chemin: string | null; erreur?: string }> {
  try {
    const client = exigerClient();
    const { blob, extension } = dataUrlVersBlob(dataUrl);

    if (blob.size > TAILLE_MAX_BUCKET) {
      return {
        chemin: null,
        erreur: `Photo trop volumineuse pour le stockage (${Math.round(blob.size / 1024)} Ko)`,
      };
    }

    const chemin = `${agentId}/${observationId}.${extension}`;
    const { error } = await client.storage.from(BUCKET_PHOTOS).upload(chemin, blob, {
      cacheControl: "31536000",
      upsert: true,
      contentType: blob.type,
    });
    if (error) {
      return { chemin: null, erreur: `Stockage photo indisponible (${error.message})` };
    }
    return { chemin };
  } catch (e) {
    return {
      chemin: null,
      erreur: e instanceof Error ? e.message : "Stockage photo indisponible",
    };
  }
}

/** URL signée valable 60 minutes (bucket privé). */
export async function urlPhoto(chemin: string): Promise<string | null> {
  try {
    const client = exigerClient();
    const { data, error } = await client.storage
      .from(BUCKET_PHOTOS)
      .createSignedUrl(chemin, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}