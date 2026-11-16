import { LIBELLES_PROBLEMES, LIBELLES_ZONES, TypeProbleme, ZoneUsine } from "./types";
import {
  TAILLE_MAX_OCTETS,
  TYPES_STOCKAGE_AUTORISES,
  validerFichierImage,
} from "./store";

/**
 * Validation du signalement public (formulaire QR Code).
 *
 * Le visiteur n'est pas authentifié : ces contrôles ne sont qu'un premier
 * filtre d'ergonomie. La règle fait autorité reste
 * `public.creer_signalement_public()` (migration 011), qui rejoue la même
 * validation côté serveur et ne fait confiance à aucune donnée du client.
 */

export const LONGUEUR_MAX_NOM = 80;
export const LONGUEUR_MAX_MATRICULE = 40;
export const LONGUEUR_MAX_COMMENTAIRE = 300;

export const TYPES_PROBLEMES = Object.keys(LIBELLES_PROBLEMES) as TypeProbleme[];
export const ZONES = Object.keys(LIBELLES_ZONES) as ZoneUsine[];

export interface SaisieSignalement {
  nom: string;
  matricule: string;
  type: TypeProbleme | null;
  zone: ZoneUsine | null;
  commentaire: string;
  photo: string | null;
}

export interface ResultatValidation {
  ok: boolean;
  erreur: string | null;
}

/** Nettoie une saisie libre (retire les espaces inutiles). */
export function nettoyer(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

/** Type MIME d'une data URL (`image/jpeg` par défaut). */
function typeDeDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/jpeg";
}

/** Vrai si la photo compressée peut être stockée telle quelle. */
export function photoEstStockable(dataUrl: string): boolean {
  return TYPES_STOCKAGE_AUTORISES.includes(typeDeDataUrl(dataUrl));
}

/**
 * Valide la saisie avant l'envoi.
 * L'ordre des contrôles va du plus visible au plus rare pour afficher le
 * message le plus utile en premier.
 */
export function validerSignalement(s: SaisieSignalement): ResultatValidation {
  if (!s.type) return { ok: false, erreur: "Choisissez le type de problème." };
  if (!TYPES_PROBLEMES.includes(s.type)) return { ok: false, erreur: "Type de problème inconnu." };
  if (!s.zone) return { ok: false, erreur: "Choisissez la zone concernée." };
  if (!ZONES.includes(s.zone)) return { ok: false, erreur: "Zone inconnue." };

  const nom = nettoyer(s.nom);
  if (nom.length > LONGUEUR_MAX_NOM) {
    return { ok: false, erreur: `Nom trop long (${LONGUEUR_MAX_NOM} caractères maximum).` };
  }

  const matricule = nettoyer(s.matricule);
  if (matricule.length > LONGUEUR_MAX_MATRICULE) {
    return {
      ok: false,
      erreur: `Matricule trop long (${LONGUEUR_MAX_MATRICULE} caractères maximum).`,
    };
  }

  const commentaire = s.commentaire.trim();
  if (commentaire.length > LONGUEUR_MAX_COMMENTAIRE) {
    return {
      ok: false,
      erreur: `Description trop longue (${LONGUEUR_MAX_COMMENTAIRE} caractères maximum).`,
    };
  }

  if (s.photo && !photoEstStockable(s.photo)) {
    return { ok: false, erreur: "Format de photo non pris en charge (JPEG, PNG ou WebP)." };
  }

  return { ok: true, erreur: null };
}

/** Message d'erreur pour un fichier photo choisi par le visiteur. */
export function erreurPhotoFichier(fichier: File): string | null {
  const probleme = validerFichierImage(fichier);
  if (probleme) return probleme;
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return "Photo trop volumineuse (20 Mo maximum avant compression).";
  }
  return null;
}

/** Début de la journée (heure de Tunis, UTC+1, sans heure d'été). */
export function debutJournee(): Date {
  const tunis = new Date(Date.now() + 60 * 60 * 1000);
  const minuitTunis = Date.UTC(
    tunis.getUTCFullYear(),
    tunis.getUTCMonth(),
    tunis.getUTCDate(),
  );
  return new Date(minuitTunis - 60 * 60 * 1000);
}

/** Début de la semaine en cours (lundi 00:00, heure de Tunis). */
export function debutSemaine(): Date {
  const tunis = new Date(Date.now() + 60 * 60 * 1000);
  const decalage = (tunis.getUTCDay() + 6) % 7;
  const lundiTunis = Date.UTC(
    tunis.getUTCFullYear(),
    tunis.getUTCMonth(),
    tunis.getUTCDate() - decalage,
  );
  return new Date(lundiTunis - 60 * 60 * 1000);
}