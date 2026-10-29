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

export type StatutAnomalie =
  | "nouvelle"
  | "en_analyse"
  | "action_en_cours"
  | "en_attente_verification"
  | "cloturee";

export type PrioriteAnomalie = "faible" | "moyenne" | "elevee" | "critique";

export interface HistoriqueEntree {
  date: string;
  utilisateur: string;
  action: string;
  ancienneValeur?: string;
  nouvelleValeur?: string;
}

export interface CommentaireInterne {
  date: string;
  auteur: string;
  texte: string;
}

export interface Observation {
  id: string;
  numeroSuivi: string;
  agentId: string;
  ownerId?: string; // Supabase Auth user id (when available)
  agentNom: string;
  agentTelephone: string;
  typeProbleme: TypeProbleme;
  commentaire: string;
  zone: ZoneUsine;
  photo?: string;
  dateCreation: string;
  partage: boolean;
  statut: StatutAnomalie;
  priorite: PrioriteAnomalie;
  responsable?: string;
  echeance?: string;
  analyseCause?: string;
  mesuresImmediates?: string;
  actionsCorrectives?: string;
  dateRealisation?: string;
  verificationEfficacite?: string;
  commentaires: CommentaireInterne[];
  piecesJointes: string[];
  historique: HistoriqueEntree[];
}

export interface Agent {
  id: string;
  telephone: string;
  nom: string;
  role: "agent" | "admin";
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

export const LIBELLES_STATUTS: Record<StatutAnomalie, string> = {
  nouvelle: "Nouvelle",
  en_analyse: "En cours d'analyse",
  action_en_cours: "Action en cours",
  en_attente_verification: "En attente de vérification",
  cloturee: "Clôturée",
};

export const LIBELLES_PRIORITES: Record<PrioriteAnomalie, string> = {
  faible: "Faible",
  moyenne: "Moyenne",
  elevee: "Élevée",
  critique: "Critique",
};

export const ADMIN_PHONES = ["00000000"];
