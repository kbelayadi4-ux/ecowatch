import { describe, expect, test } from "bun:test";
import {
  estErreurSchemaAncien,
  payloadObservation,
  payloadObservationLegacy,
} from "../src/lib/data";
import { validerFichierImage } from "../src/lib/store";
import type { Observation } from "../src/lib/types";

function observation(photo?: string): Observation {
  return {
    id: "obs-1",
    numeroSuivi: "",
    agentId: "agent-1",
    agentNom: "Agent A",
    agentTelephone: "20000001",
    typeProbleme: "fuite_eau",
    commentaire: "Test",
    zone: "cru",
    photo,
    dateCreation: "2026-11-13T08:00:00.000Z",
    partage: false,
    statut: "nouvelle",
    priorite: "normale",
    assigneA: null,
    echeance: null,
    dateCloture: null,
    majLe: "2026-11-13T08:00:00.000Z",
  };
}

function fichier(nom: string, type: string, taille: number): File {
  return { name: nom, type, size: taille } as File;
}

describe("payload d'insertion d'une observation", () => {
  test("observation sans photo : photo null, pas de chemin", () => {
    const payload = payloadObservation(observation());
    expect(payload.photo).toBeNull();
    expect(payload.photo_path).toBeNull();
    expect(payload.statut).toBe("nouvelle");
    expect(payload.priorite).toBe("normale");
    // L'identite vient du client mais sera imposee par la base.
    expect(payload.agent_id).toBe("agent-1");
    expect(payload.numero_suivi).toBeUndefined();
  });

  test("observation avec photo en base : colonne photo renseignee", () => {
    const payload = payloadObservation(observation("data:image/jpeg;base64,AAAA"));
    expect(payload.photo).toBe("data:image/jpeg;base64,AAAA");
    expect(payload.photo_path).toBeNull();
  });

  test("observation avec photo stockee : colonne photo_path renseignee", () => {
    const obs = observation();
    obs.photo = undefined;
    obs.photoPath = "agent-1/obs-1.jpg";
    const payload = payloadObservation(obs);
    expect(payload.photo).toBeNull();
    expect(payload.photo_path).toBe("agent-1/obs-1.jpg");
  });

  test("schéma historique : aucune colonne de suivi, ni photo_path", () => {
    const payload = payloadObservationLegacy(observation("data:image/jpeg;base64,AAAA"));
    const cles = Object.keys(payload).sort();
    expect(cles).toEqual([
      "agent_id",
      "agent_nom",
      "agent_telephone",
      "commentaire",
      "date_creation",
      "id",
      "partage",
      "photo",
      "type_probleme",
      "zone",
    ]);
  });
});

describe("détection d'une base sans migration 009", () => {
  test("message PostgreSQL typique", () => {
    expect(
      estErreurSchemaAncien('column "statut" of relation "observations" does not exist'),
    ).toBe(true);
  });

  test("cache de schéma PostgREST", () => {
    expect(
      estErreurSchemaAncien(
        'Could not find the \'statut\' column of \'observations\' in the schema cache',
      ),
    ).toBe(true);
  });

  test("erreur RLS : pas un problème de schéma", () => {
    expect(
      estErreurSchemaAncien(
        'new row violates row-level security policy for table "observations"',
      ),
    ).toBe(false);
  });

  test("erreur réseau : pas un problème de schéma", () => {
    expect(estErreurSchemaAncien("TypeError: Failed to fetch")).toBe(false);
  });
});

describe("validation du fichier photo", () => {
  test("JPEG accepté", () => {
    expect(validerFichierImage(fichier("photo.jpg", "image/jpeg", 2_000_000))).toBeNull();
  });

  test("HEIC accepté (iPhone)", () => {
    expect(validerFichierImage(fichier("photo.heic", "image/heic", 3_000_000))).toBeNull();
  });

  test("format non image refusé", () => {
    const probleme = validerFichierImage(fichier("facture.pdf", "application/pdf", 1000));
    expect(probleme).not.toBeNull();
  });

  test("fichier vide refusé", () => {
    expect(validerFichierImage(fichier("photo.jpg", "image/jpeg", 0))).not.toBeNull();
  });

  test("photo de 25 Mo refusée", () => {
    const probleme = validerFichierImage(fichier("grosse.jpg", "image/jpeg", 25 * 1024 * 1024));
    expect(probleme).not.toBeNull();
  });

  test("photo de 8 Mo acceptée (compressée ensuite)", () => {
    expect(validerFichierImage(fichier("moyenne.jpg", "image/jpeg", 8 * 1024 * 1024))).toBeNull();
  });
});