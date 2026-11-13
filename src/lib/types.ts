export type TypeProbleme =
  | "fuite_huile"
  | "fuite_eau"
  | "fuite_matiere"
  | "dechet_mal_trie"
  | "chiffon_souille"
  | "epi_eparpille"
  | "site_mal_arrange"
  | "odeur_anormal"
  | "autre";

export type ZoneUsine =
  | "cru"
  | "cuisson"
  | "carriere"
  | "ciment"
  | "expedition"
  | "usine";

export type StatutObservation =
  | "nouvelle"
  | "en_analyse"
  | "action_en_cours"
  | "attente_verification"
  | "cloturee";

export type Priorite = "basse" | "normale" | "haute" | "critique";

export interface EvenementSuivi {
  id: number;
  action: "creation" | "modification" | "suppression";
  auteurNom: string | null;
  auteurRole: string | null;
  resume: string | null;
  creeLe: string;
}

export interface Observation {
  id: string;
  numeroSuivi: string;
  agentId: string;
  agentNom: string;
  agentTelephone: string;
  typeProbleme: TypeProbleme;
  commentaire: string;
  zone: ZoneUsine;
  photo?: string;
  photoPath?: string;
  dateCreation: string;
  partage: boolean;
  statut: StatutObservation;
  priorite: Priorite;
  assigneA: string | null;
  echeance: string | null;
  dateCloture: string | null;
  majLe: string;
}

export interface Agent {
  id: string;
  telephone: string;
  nom: string;
  role: "agent" | "admin";
}

export interface PageObservations {
  lignes: Observation[];
  total: number;
}

export interface FiltresObservations {
  statut?: StatutObservation | "";
  priorite?: Priorite | "";
  zone?: ZoneUsine | "";
  type?: TypeProbleme | "";
  agentId?: string;
  recherche?: string;
  enRetardSeulement?: boolean;
}

export interface Kpis {
  total: number;
  nouvelles: number;
  enCours: number;
  enRetard: number;
  cloturees: number;
}

export const LIBELLES_PROBLEMES: Record<TypeProbleme, string> = {
  fuite_huile: "Fuite huile",
  fuite_eau: "Fuite eau",
  fuite_matiere: "Fuite matière",
  dechet_mal_trie: "Déchet mal trié",
  chiffon_souille: "Chiffon souillé éparpillé",
  epi_eparpille: "EPI usagé éparpillé",
  site_mal_arrange: "Site mal arrangé",
  odeur_anormal: "Odeur anormale",
  autre: "Autre",
};

export const LIBELLES_ZONES: Record<ZoneUsine, string> = {
  cru: "Cru",
  cuisson: "Cuisson",
  carriere: "Carrière",
  ciment: "Ciment",
  expedition: "Expédition",
  usine: "Usine (général)",
};

export const LIBELLES_STATUTS: Record<StatutObservation, string> = {
  nouvelle: "Nouvelle",
  en_analyse: "En analyse",
  action_en_cours: "Action en cours",
  attente_verification: "En attente de vérification",
  cloturee: "Clôturée",
};

export const LIBELLES_PRIORITES: Record<Priorite, string> = {
  basse: "Basse",
  normale: "Normale",
  haute: "Haute",
  critique: "Critique",
};

export const STATUTS: StatutObservation[] = [
  "nouvelle",
  "en_analyse",
  "action_en_cours",
  "attente_verification",
  "cloturee",
];

export const PRIORITES: Priorite[] = ["basse", "normale", "haute", "critique"];

/** Statuts considérés comme « en cours » de traitement. */
export const STATUTS_EN_COURS: StatutObservation[] = [
  "en_analyse",
  "action_en_cours",
  "attente_verification",
];

export function estEnRetard(obs: Observation): boolean {
  if (!obs.echeance) return false;
  if (obs.statut === "cloturee") return false;
  return new Date(obs.echeance).getTime() < Date.now();
}

export function estResolue(obs: Observation): boolean {
  return obs.statut === "cloturee";
}