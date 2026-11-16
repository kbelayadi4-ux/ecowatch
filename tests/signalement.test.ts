import { describe, expect, test } from "bun:test";
import {
  LONGUEUR_MAX_COMMENTAIRE,
  LONGUEUR_MAX_MATRICULE,
  LONGUEUR_MAX_NOM,
  debutJournee,
  debutSemaine,
  erreurPhotoFichier,
  photoEstStockable,
  validerSignalement,
} from "../src/lib/signalement";
import type { SaisieSignalement } from "../src/lib/signalement";

function saisie(surcharge: Partial<SaisieSignalement> = {}): SaisieSignalement {
  return {
    nom: "",
    matricule: "",
    type: "fuite_eau",
    zone: "cru",
    commentaire: "",
    photo: null,
    ...surcharge,
  };
}

function fichier(nom: string, type: string, taille: number): File {
  return { name: nom, type, size: taille } as File;
}

describe("validation du signalement public", () => {
  test("saisie minimale valide (type + zone)", () => {
    const r = validerSignalement(saisie());
    expect(r.ok).toBe(true);
    expect(r.erreur).toBeNull();
  });

  test("sans type : refusé", () => {
    const r = validerSignalement(saisie({ type: null }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("type");
  });

  test("type inconnu : refusé", () => {
    const r = validerSignalement(saisie({ type: "type_inconnu" as never }));
    expect(r.ok).toBe(false);
  });

  test("sans zone : refusé", () => {
    const r = validerSignalement(saisie({ zone: null }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("zone");
  });

  test("zone inconnue : refusé", () => {
    const r = validerSignalement(saisie({ zone: "zone_inconnue" as never }));
    expect(r.ok).toBe(false);
  });

  test("nom et matricule facultatifs", () => {
    const r = validerSignalement(saisie({ nom: "   ", matricule: "  " }));
    expect(r.ok).toBe(true);
  });

  test("nom trop long : refusé", () => {
    const r = validerSignalement(saisie({ nom: "a".repeat(LONGUEUR_MAX_NOM + 1) }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("Nom trop long");
  });

  test("matricule trop long : refusé", () => {
    const r = validerSignalement(saisie({ matricule: "m".repeat(LONGUEUR_MAX_MATRICULE + 1) }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("Matricule trop long");
  });

  test("description trop longue : refusé", () => {
    const r = validerSignalement(saisie({ commentaire: "x".repeat(LONGUEUR_MAX_COMMENTAIRE + 1) }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("Description trop longue");
  });

  test("photo JPEG acceptée", () => {
    const r = validerSignalement(saisie({ photo: "data:image/jpeg;base64,AAAA" }));
    expect(r.ok).toBe(true);
  });

  test("photo HEIC non convertible : refusée", () => {
    const r = validerSignalement(saisie({ photo: "data:image/heic;base64,AAAA" }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("photo");
  });

  test("photo SVG : refusée", () => {
    const r = validerSignalement(saisie({ photo: "data:image/svg+xml;base64,AAAA" }));
    expect(r.ok).toBe(false);
  });
});

describe("type des photos", () => {
  test("jpeg, png et webp stockables", () => {
    expect(photoEstStockable("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(photoEstStockable("data:image/png;base64,AAAA")).toBe(true);
    expect(photoEstStockable("data:image/webp;base64,AAAA")).toBe(true);
  });

  test("heic et heif non stockables", () => {
    expect(photoEstStockable("data:image/heic;base64,AAAA")).toBe(false);
    expect(photoEstStockable("data:image/heif;base64,AAAA")).toBe(false);
  });
});

describe("validation du fichier photo choisi", () => {
  test("JPEG de 3 Mo accepté", () => {
    expect(erreurPhotoFichier(fichier("p.jpg", "image/jpeg", 3 * 1024 * 1024))).toBeNull();
  });

  test("PDF refusé", () => {
    expect(erreurPhotoFichier(fichier("doc.pdf", "application/pdf", 1000))).not.toBeNull();
  });

  test("fichier vide refusé", () => {
    expect(erreurPhotoFichier(fichier("p.jpg", "image/jpeg", 0))).not.toBeNull();
  });

  test("fichier de 25 Mo refusé", () => {
    expect(erreurPhotoFichier(fichier("gros.jpg", "image/jpeg", 25 * 1024 * 1024))).not.toBeNull();
  });
});

describe("bornes de temps (heure de Tunis, UTC+1)", () => {
  test("début de journée = 23:00 UTC la veille", () => {
    const d = debutJournee();
    expect(d.getUTCHours()).toBe(23);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });

  test("début de journée dans le passé", () => {
    expect(debutJournee().getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("début de semaine = lundi 23:00 UTC", () => {
    const d = debutSemaine();
    // 23:00 UTC du dimanche = 00:00 lundi à Tunis.
    expect(d.getUTCDay()).toBe(0);
    expect(d.getUTCHours()).toBe(23);
  });

  test("début de semaine antérieur ou égal au début de journée", () => {
    expect(debutSemaine().getTime()).toBeLessThanOrEqual(debutJournee().getTime());
  });

  test("début de semaine dans le passé", () => {
    expect(debutSemaine().getTime()).toBeLessThanOrEqual(Date.now());
  });
});