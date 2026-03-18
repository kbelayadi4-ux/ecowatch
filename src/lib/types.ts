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

export interface Observation {
  id: string;
  agentId: string;
  agentNom: string;
  agentTelephone: string;
  typeProbleme: TypeProbleme;
  commentaire: string;
  zone: ZoneUsine;
  photo?: string; // base64
  dateCreation: string; // ISO string
  partage: boolean;
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

// Numéros admin (sans +216)
export const ADMIN_PHONES = ["00000000"];
