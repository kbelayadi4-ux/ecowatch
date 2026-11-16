"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Image as ImageIcon,
  Leaf,
  Loader2,
  MapPin,
  Send,
  X,
} from "lucide-react";
import { LIBELLES_PROBLEMES, LIBELLES_ZONES, TypeProbleme, ZoneUsine } from "@/lib/types";
import {
  LONGUEUR_MAX_COMMENTAIRE,
  LONGUEUR_MAX_MATRICULE,
  LONGUEUR_MAX_NOM,
  erreurPhotoFichier,
  validerSignalement,
} from "@/lib/signalement";
import {
  compresserPhoto,
  fichierVersDataUrl,
  estTypeStockable,
} from "@/lib/store";
import { creerSignalementPublic } from "@/lib/data";

const ICONE_PROBLEME: Record<TypeProbleme, string> = {
  fuite_huile: "🛢️",
  fuite_eau: "💧",
  fuite_matiere: "⚗️",
  dechet_mal_trie: "♻️",
  chiffon_souille: "🧹",
  epi_eparpille: "🦺",
  site_mal_arrange: "🏭",
  odeur_anormal: "💨",
  autre: "⚠️",
};

const typesProblemes = Object.entries(LIBELLES_PROBLEMES) as [TypeProbleme, string][];
const zones = Object.entries(LIBELLES_ZONES) as [ZoneUsine, string][];

type Etat = "formulaire" | "envoi" | "succes";

/**
 * Formulaire public de signalement (accès QR Code).
 *
 * Aucun compte, aucun numéro de téléphone, aucune session :
 * l'enregistrement passe par `creer_signalement_public()` côté serveur.
 */
export default function SignalementPublic() {
  const [nom, setNom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [type, setType] = useState<TypeProbleme | null>(null);
  const [zone, setZone] = useState<ZoneUsine | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat>("formulaire");
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const envoiRef = useRef(false);

  const peutEnvoyer = Boolean(type && zone);

  const reinitialiser = () => {
    setNom("");
    setMatricule("");
    setType(null);
    setZone(null);
    setCommentaire("");
    setPhoto(null);
    setAvertissement(null);
    setErreur(null);
    setNumero(null);
    setEtat("formulaire");
    if (fichierRef.current) fichierRef.current.value = "";
  };

  // ── Photo ────────────────────────────────────────────────────
  const choisirPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;

    const probleme = erreurPhotoFichier(fichier);
    if (probleme) {
      setAvertissement(probleme);
      return;
    }

    setAvertissement(null);
    try {
      const brut = await fichierVersDataUrl(fichier);
      const compresse = await compresserPhoto(brut, 1000, 0.72);
      if (!estTypeStockable(compresse)) {
        setPhoto(null);
        setAvertissement(
          "Ce navigateur ne sait pas convertir ce format (HEIC/HEIF). Choisissez une photo JPEG, PNG ou WebP.",
        );
        return;
      }
      setPhoto(compresse);
    } catch {
      setPhoto(null);
      setAvertissement("Lecture de l'image impossible, choisissez une autre photo.");
    }
  };

  // ── Envoi ────────────────────────────────────────────────────
  const envoyer = async () => {
    if (envoiRef.current) return;

    const saisie = {
      nom,
      matricule,
      type,
      zone,
      commentaire,
      photo,
    };

    const validation = validerSignalement(saisie);
    if (!validation.ok) {
      setErreur(validation.erreur);
      return;
    }

    envoiRef.current = true;
    setEtat("envoi");
    setErreur(null);
    setAvertissement(null);

    try {
      const resultat = await creerSignalementPublic(saisie);
      if (!resultat.ok) {
        console.error("[EcoWatch] signalement refusé", resultat.erreur);
        setErreur(resultat.erreur ?? "Envoi impossible pour le moment.");
        setEtat("formulaire");
        return;
      }
      setNumero(resultat.numeroSuivi ?? null);
      setEtat("succes");
    } catch (e) {
      console.error("[EcoWatch] exception pendant l'envoi", e);
      setErreur(
        e instanceof Error
          ? e.message
          : "Envoi impossible. Vérifiez votre connexion puis réessayez.",
      );
      setEtat("formulaire");
    } finally {
      envoiRef.current = false;
    }
  };

  if (etat === "succes") {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col">
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <h1 className="font-black text-xl text-gray-800">Signalement enregistré</h1>
            <p className="text-sm text-gray-500 mt-2">
              Merci. L&apos;administration EcoWatch SCG a reçu votre observation.
            </p>
            {numero && (
              <div className="mt-5 bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide">
                  Numéro de suivi
                </p>
                <p className="font-mono text-lg font-black text-green-800 mt-1">{numero}</p>
              </div>
            )}
            <button
              onClick={reinitialiser}
              className="btn-terrain btn-primary w-full mt-6"
              style={{ minHeight: 56 }}
            >
              <Send className="w-5 h-5" /> Nouveau signalement
            </button>
            <p className="text-xs text-gray-400 mt-4">
              Vous pouvez fermer cette page.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (etat === "envoi") {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center px-4">
        <Loader2 className="w-10 h-10 text-green-600 animate-spin" />
        <p className="mt-4 font-bold text-gray-700">Envoi du signalement…</p>
        <p className="text-xs text-gray-500 mt-1">Merci de patienter quelques secondes.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 flex flex-col">
      <header className="bg-green-700 text-white px-4 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-2">
            <Leaf className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-lg leading-none">EcoWatch SCG</p>
            <p className="text-green-200 text-xs mt-1">Signalement environnemental</p>
          </div>
          <a
            href="/admin"
            className="ml-auto text-green-100 text-xs underline decoration-green-300 hover:text-white"
          >
            Administration
          </a>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 pb-32 max-w-2xl w-full mx-auto">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-700">
            Signalez un problème sur le site. Aucun compte n&apos;est nécessaire.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Renseignez le type et la zone : l&apos;administration reçoit l&apos;observation
            immédiatement.
          </p>
        </div>

        {(avertissement || erreur) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold">{erreur ?? avertissement}</p>
              {erreur && (
                <details className="mt-1">
                  <summary className="cursor-pointer underline">Détail technique</summary>
                  <p className="font-mono text-[11px] break-all mt-1">{erreur}</p>
                </details>
              )}
            </div>
          </div>
        )}

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-black text-gray-800 text-base mb-1">Type de problème <span className="text-red-500">*</span></h2>
          <p className="text-gray-500 text-xs mb-3">Sélectionnez la catégorie</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {typesProblemes.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`choix-card ${type === key ? "selected" : ""}`}
                onClick={() => setType(key)}
              >
                <span className="text-xl mr-3">{ICONE_PROBLEME[key]}</span>
                <span className="flex-1 text-left">{label}</span>
                {type === key && (
                  <span className="ml-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-black text-gray-800 text-base mb-1">Zone <span className="text-red-500">*</span></h2>
          <p className="text-gray-500 text-xs mb-3">Où se trouve le problème ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {zones.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`choix-card justify-center text-center ${zone === key ? "selected" : ""}`}
                onClick={() => setZone(key)}
              >
                <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-black text-gray-800 text-base mb-1">Description</h2>
          <p className="text-gray-500 text-xs mb-3">Précisez ce que vous avez observé (facultatif)</p>
          <textarea
            className="input-terrain resize-none"
            rows={3}
            maxLength={LONGUEUR_MAX_COMMENTAIRE}
            placeholder="Ex : fuite visible sous la cuve n°3…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
          <p className="text-right text-xs text-gray-400 mt-1">
            {commentaire.length}/{LONGUEUR_MAX_COMMENTAIRE}
          </p>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-black text-gray-800 text-base mb-1">Photo</h2>
          <p className="text-gray-500 text-xs mb-3">Facultative – compressée automatiquement</p>
          {photo ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Photo du problème" className="w-full object-cover max-h-56 rounded-xl" />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 shadow-lg"
                aria-label="Retirer la photo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn-terrain btn-secondary"
                onClick={() => {
                  const input = fichierRef.current;
                  if (!input) return;
                  input.setAttribute("capture", "environment");
                  input.click();
                }}
              >
                <Camera className="w-5 h-5" /> Caméra
              </button>
              <button
                type="button"
                className="btn-terrain btn-secondary"
                onClick={() => {
                  const input = fichierRef.current;
                  if (!input) return;
                  input.removeAttribute("capture");
                  input.click();
                }}
              >
                <ImageIcon className="w-5 h-5" /> Galerie
              </button>
            </div>
          )}
          <input
            ref={fichierRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            className="hidden"
            onChange={choisirPhoto}
          />
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-black text-gray-800 text-base mb-1">Votre identité (facultatif)</h2>
          <p className="text-gray-500 text-xs mb-3">
            Permet à l&apos;administration de vous recontacter si besoin.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-gray-600">
              Nom
              <input
                className="input-terrain mt-1"
                maxLength={LONGUEUR_MAX_NOM}
                placeholder="Ex : Ahmed Ben Ali"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Matricule
              <input
                className="input-terrain mt-1"
                maxLength={LONGUEUR_MAX_MATRICULE}
                placeholder="Ex : SCG-1042"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
              />
            </label>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <button
            className={`btn-terrain w-full text-lg ${peutEnvoyer ? "btn-primary" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
            style={{ minHeight: 64 }}
            disabled={!peutEnvoyer}
            onClick={envoyer}
          >
            <Send className="w-5 h-5" /> Envoyer le signalement
          </button>
          <p className="text-center text-xs text-gray-400 mt-1.5">
            {peutEnvoyer
              ? "Aucune donnée personnelle n'est obligatoire"
              : "Choisissez le type et la zone pour continuer"}
          </p>
        </div>
      </div>
    </div>
  );
}