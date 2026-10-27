"use client";

import { useState, useRef } from "react";
import {
  ChevronLeft,
  Camera,
  MapPin,
  Send,
  CheckCircle,
  Image as ImageIcon,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Agent,
  TypeProbleme,
  ZoneUsine,
  Observation,
  LIBELLES_PROBLEMES,
  LIBELLES_ZONES,
} from "@/lib/types";
import { saveObservation, generateId, compresserPhoto } from "@/lib/store";

interface Props {
  agent: Agent;
  onRetour: () => void;
  onSaved: () => void;
}

const COULEUR_BADGE: Record<TypeProbleme, string> = {
  fuite_huile: "badge-orange",
  fuite_eau: "badge-blue",
  fuite_matiere: "badge-purple",
  dechet_mal_trie: "badge-green",
  chiffon_souille: "badge-yellow",
  epi_eparpille: "badge-yellow",
  site_mal_arrange: "badge-gray",
  odeur_anormal: "badge-red",
  autre: "badge-gray",
};

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

type Etat = "formulaire" | "envoi" | "succes" | "erreur";

export default function NouvelleObservation({ agent, onRetour, onSaved }: Props) {
  const [type, setType] = useState<TypeProbleme | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [zone, setZone] = useState<ZoneUsine | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat>("formulaire");
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [numeroSuivi, setNumeroSuivi] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const typesProblemes = Object.entries(LIBELLES_PROBLEMES) as [TypeProbleme, string][];
  const zones = Object.entries(LIBELLES_ZONES) as [ZoneUsine, string][];

  // ── Photo : lecture + compression automatique ────────────────
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      // Compression automatique avant stockage
      const compresse = await compresserPhoto(base64, 800, 0.72);
      setPhoto(compresse);
    };
    reader.readAsDataURL(file);
  };

  // ── Enregistrement ───────────────────────────────────────────
  const handleEnvoyer = async () => {
    if (!type || !zone) return;
    setEtat("envoi");
    setAvertissement(null);

    const obs: Observation = {
      id: generateId(),
      numeroSuivi: "",
      agentId: agent.id,
      agentNom: agent.nom,
      agentTelephone: agent.telephone,
      typeProbleme: type,
      commentaire: commentaire.trim(),
      zone,
      photo: photo || undefined,
      dateCreation: new Date().toISOString(),
      partage: false,
      statut: "nouvelle",
      priorite: "moyenne",
      commentaires: [],
      piecesJointes: [],
      historique: [],
    };
    obs.numeroSuivi = `EW-${obs.id.slice(-6).toUpperCase()}`;
    obs.historique = [{ date: obs.dateCreation, utilisateur: agent.nom, action: "Création", nouvelleValeur: "Nouvelle" }];

    const resultat = saveObservation(obs);

      if (resultat.ok) {
        setNumeroSuivi(obs.numeroSuivi);
        if (resultat.erreur === "photo_ignoree") {

        setAvertissement("Photo non sauvegardée (mémoire insuffisante) – observation enregistrée.");
      }
      setEtat("succes");
    } else {
      setEtat("erreur");
    }
  };

  const recommencer = () => {
    setType(null);
    setCommentaire("");
    setZone(null);
    setPhoto(null);
    setEtat("formulaire");
    setAvertissement(null);
  };

  // ── ÉCRAN : Envoi en cours ───────────────────────────────────
  if (etat === "envoi") {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center px-6">
        <Loader2 className="w-16 h-16 text-green-600 animate-spin mb-4" />
        <p className="text-green-800 font-bold text-lg">Enregistrement…</p>
      </div>
    );
  }

  // ── ÉCRAN : Succès ───────────────────────────────────────────
  if (etat === "succes") {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Animation succès */}
          <div className="text-center mb-6">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-14 h-14 text-green-600" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-black text-green-800 mb-1">
              Signalement envoyé !
            </h2>
            <p className="text-gray-500 text-sm">
              L&apos;administrateur a été notifié automatiquement.
            </p>
            {numeroSuivi && (
              <p className="text-green-800 font-black text-sm mt-2">
                N° de suivi : {numeroSuivi}
              </p>
            )}
          </div>

          {/* Résumé de l'observation */}
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-5 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{type ? ICONE_PROBLEME[type] : "⚠️"}</span>
              <div>
                <p className="font-black text-gray-800">
                  {type ? LIBELLES_PROBLEMES[type] : ""}
                </p>
                <p className="text-xs text-gray-500">
                  📍 {zone ? LIBELLES_ZONES[zone] : ""} &nbsp;•&nbsp; {new Date().toLocaleString("fr-TN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            {commentaire && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-2">
                {commentaire}
              </p>
            )}
            {photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photo} alt="Photo" className="w-full max-h-28 object-cover rounded-xl" />
            )}
          </div>

          {/* Avertissement si photo ignorée */}
          {avertissement && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700">{avertissement}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              className="btn-terrain btn-primary w-full text-lg"
              style={{ minHeight: 72 }}
              onClick={recommencer}
            >
              <Send className="w-6 h-6" />
              Nouveau signalement
            </button>
            <button
              className="btn-terrain btn-secondary w-full"
              onClick={onSaved}
            >
              Voir mes signalements
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ÉCRAN : Erreur ───────────────────────────────────────────
  if (etat === "erreur") {
    return (
      <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-black text-red-700 mb-2">
            Échec de l&apos;enregistrement
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            La mémoire de l&apos;application est pleine. Essayez sans photo ou contactez l&apos;administrateur.
          </p>
          <div className="space-y-3">
            <button className="btn-terrain btn-primary w-full" onClick={recommencer}>
              Réessayer sans photo
            </button>
            <button className="btn-terrain btn-secondary w-full" onClick={onRetour}>
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ÉCRAN : Formulaire ───────────────────────────────────────
  const peutEnvoyer = type !== null && zone !== null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-700 text-white px-5 py-4 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <button
          onClick={onRetour}
          className="bg-white/20 rounded-xl p-2 hover:bg-white/30 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <p className="font-black text-lg leading-none">Nouvelle Observation</p>
          <p className="text-green-200 text-xs">{agent.nom}</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 pb-32">
        {/* Type de problème */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">
            Type de problème <span className="text-red-500">*</span>
          </h3>
          <p className="text-gray-500 text-xs mb-3">Sélectionnez la catégorie</p>
          <div className="grid grid-cols-1 gap-2">
            {typesProblemes.map(([key, label]) => (
              <button
                key={key}
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

        {/* Zone */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">
            Zone <span className="text-red-500">*</span>
          </h3>
          <p className="text-gray-500 text-xs mb-3">Où se trouve le problème ?</p>
          <div className="grid grid-cols-2 gap-2">
            {zones.map(([key, label]) => (
              <button
                key={key}
                className={`choix-card justify-center text-center ${zone === key ? "selected" : ""}`}
                onClick={() => setZone(key)}
              >
                <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Commentaire */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">Commentaire</h3>
          <p className="text-gray-500 text-xs mb-3">Description courte (facultatif)</p>
          <textarea
            className="input-terrain resize-none"
            rows={3}
            placeholder="Ex: Fuite visible sous la cuve n°3…"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            maxLength={300}
          />
          <p className="text-right text-xs text-gray-400 mt-1">{commentaire.length}/300</p>
        </section>

        {/* Photo */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">Photo</h3>
          <p className="text-gray-500 text-xs mb-3">
            Facultatif – compressée automatiquement
          </p>
          {photo ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Photo" className="w-full object-cover max-h-56 rounded-xl" />
              <button
                onClick={() => setPhoto(null)}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                className="btn-terrain btn-secondary"
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.setAttribute("capture", "environment");
                    fileRef.current.click();
                  }
                }}
              >
                <Camera className="w-5 h-5" />
                Caméra
              </button>
              <button
                className="btn-terrain btn-secondary"
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.removeAttribute("capture");
                    fileRef.current.click();
                  }
                }}
              >
                <ImageIcon className="w-5 h-5" />
                Galerie
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        </section>
      </main>

      {/* Bouton flottant */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <button
          className={`btn-terrain w-full text-lg ${peutEnvoyer ? "btn-primary" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
          style={{ minHeight: 68 }}
          disabled={!peutEnvoyer}
          onClick={handleEnvoyer}
        >
          <Send className="w-6 h-6" />
          Envoyer le signalement
        </button>
        {!peutEnvoyer && (
          <p className="text-center text-xs text-gray-400 mt-1.5">
            Choisissez le type et la zone pour continuer
          </p>
        )}
      </div>
    </div>
  );
}
