/**
 * Utilitaires côté navigateur.
 *
 * Le localStorage ne conserve plus aucune donnée métier : Supabase est la
 * seule source de vérité. Ce module ne garde que la compression d'image et
 * la génération d'identifiants, qui n'ont pas de dépendance réseau.
 */

export function compresserPhoto(base64: string, maxPx = 1000, qualite = 0.72): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(base64);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", qualite));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Formats acceptés pour une photographie.
 * `heic`/`heif` sont acceptés (iPhone) : si le navigateur ne sait pas les
 * décoder, l'image est conservée telle quelle plutôt que bloquée.
 */
export const TYPES_IMAGE_AUTORISES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Taille maximale avant compression (le bucket est configuré à 5 Mo). */
export const TAILLE_MAX_OCTETS = 20 * 1024 * 1024;

/** Types réellement acceptés par le bucket privé `photos`. */
export const TYPES_STOCKAGE_AUTORISES = ["image/jpeg", "image/png", "image/webp"];

/** Type MIME déclaré dans une data URL (`image/jpeg` par défaut). */
export function typeDeDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/jpeg";
}

/**
 * Vrai si l'image peut être déposée dans le bucket telle quelle.
 * Une photo HEIC/HEIF que le navigateur ne sait pas décoder (donc pas
 * convertir en JPEG par `compresserPhoto`) ressort avec son type d'origine :
 * le dépôt serait refusé, il est donc signalé avant l'envoi.
 */
export function estTypeStockable(dataUrl: string): boolean {
  return TYPES_STOCKAGE_AUTORISES.includes(typeDeDataUrl(dataUrl));
}

/** Taille maximale réellement déposée dans le bucket. */
export const TAILLE_MAX_BUCKET = 5 * 1024 * 1024;

export function validerFichierImage(fichier: File): string | null {
  const type = (fichier.type || "").toLowerCase();
  const extensionOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(fichier.name);
  if (!type.startsWith("image/") && !extensionOk) {
    return "Fichier non reconnu comme une image (JPEG, PNG, WebP ou HEIC).";
  }
  if (fichier.size === 0) {
    return "Fichier vide : choisissez une autre photo.";
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return "Photo trop volumineuse (20 Mo maximum avant compression).";
  }
  return null;
}

/** Conversion d'un fichier image en data URL (pour la compression). */
export function fichierVersDataUrl(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error("Lecture du fichier impossible"));
    lecteur.readAsDataURL(fichier);
  });
}