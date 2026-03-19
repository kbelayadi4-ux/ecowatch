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
  Share2,
} from "lucide-react";
import {
  Agent,
  TypeProbleme,
  ZoneUsine,
  Observation,
  LIBELLES_PROBLEMES,
  LIBELLES_ZONES,
} from "@/lib/types";
import { saveObservation, generateId } from "@/lib/store";

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

export default function NouvelleObservation({ agent, onRetour, onSaved }: Props) {
  const [type, setType] = useState<TypeProbleme | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [zone, setZone] = useState<ZoneUsine | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [obsId, setObsId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const typesProblemes = Object.entries(LIBELLES_PROBLEMES) as [
    TypeProbleme,
    string,
  ][];
  const zones = Object.entries(LIBELLES_ZONES) as [ZoneUsine, string][];

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleEnvoyer = () => {
    if (!type || !zone) return;
    const id = generateId();
    const obs: Observation = {
      id,
      agentId: agent.id,
      agentNom: agent.nom,
      agentTelephone: agent.telephone,
      typeProbleme: type,
      commentaire: commentaire.trim(),
      zone,
      photo: photo || undefined,
      dateCreation: new Date().toISOString(),
      partage: false,
    };
    saveObservation(obs);
    setObsId(id);
    setSucces(true);
  };

  const getTextePartage = () => {
    if (!type || !zone) return "";
    const date = new Date().toLocaleString("fr-TN");
    return (
      `🌿 EcoWatch – Signalement\n` +
      `👤 Agent: ${agent.nom}\n` +
      `📍 Zone: ${LIBELLES_ZONES[zone]}\n` +
      `⚠️ Type: ${LIBELLES_PROBLEMES[type]}\n` +
      (commentaire ? `💬 Note: ${commentaire}\n` : "") +
      `📅 Date: ${date}`
    );
  };

  const partagerWhatsApp = () => {
    const texte = encodeURIComponent(getTextePartage());
    window.open(`https://wa.me/?text=${texte}`, "_blank");
  };

  const partagerEmail = () => {
    const sujet = encodeURIComponent(`EcoWatch – Signalement ${type ? LIBELLES_PROBLEMES[type] : ""}`);
    const corps = encodeURIComponent(getTextePartage());
    window.open(`mailto:?subject=${sujet}&body=${corps}`, "_blank");
  };

  if (succes) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-4" strokeWidth={1.5} />
          <h2 className="text-2xl font-black text-green-800 mb-2">
            Observation enregistrée !
          </h2>
          <p className="text-gray-500 mb-8">
            Votre signalement a bien été sauvegardé.
          </p>

          {/* Partager */}
          <div className="bg-white rounded-2xl p-4 shadow mb-4 text-left">
            <p className="font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-green-600" />
              Partager ce rapport
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="btn-terrain bg-green-500 text-white rounded-xl text-base"
                onClick={partagerWhatsApp}
              >
                📱 WhatsApp
              </button>
              <button
                className="btn-terrain bg-blue-600 text-white rounded-xl text-base"
                onClick={partagerEmail}
              >
                📧 Email
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              className="btn-terrain btn-primary w-full"
              onClick={onSaved}
            >
              Voir mes signalements
            </button>
            <button
              className="btn-terrain btn-secondary w-full"
              onClick={() => {
                setType(null);
                setCommentaire("");
                setZone(null);
                setPhoto(null);
                setSucces(false);
                setObsId(null);
              }}
            >
              Nouvelle observation
            </button>
          </div>
        </div>
      </div>
    );
  }

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

      <main className="flex-1 px-4 py-5 space-y-6 pb-32">
        {/* Type de problème */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">
            Type de problème <span className="text-red-500">*</span>
          </h3>
          <p className="text-gray-500 text-xs mb-3">
            Sélectionnez la catégorie la plus proche
          </p>
          <div className="grid grid-cols-1 gap-2">
            {typesProblemes.map(([key, label]) => (
              <button
                key={key}
                className={`choix-card ${type === key ? "selected" : ""}`}
                onClick={() => setType(key)}
              >
                <span
                  className={`badge ${COULEUR_BADGE[key]} mr-3`}
                >
                  {label.slice(0, 3).toUpperCase()}
                </span>
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Zone */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">
            Zone / Localisation <span className="text-red-500">*</span>
          </h3>
          <p className="text-gray-500 text-xs mb-3">
            Où se trouve le problème ?
          </p>
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
          <h3 className="font-black text-gray-800 text-base mb-1">
            Commentaire
          </h3>
          <p className="text-gray-500 text-xs mb-3">
            Décrivez brièvement le problème (facultatif)
          </p>
          <textarea
            className="input-terrain resize-none"
            rows={3}
            placeholder="Ex: Fuite visible sous la cuve n°3, huile sur le sol..."
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            maxLength={300}
          />
          <p className="text-right text-xs text-gray-400 mt-1">
            {commentaire.length}/300
          </p>
        </section>

        {/* Photo */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-black text-gray-800 text-base mb-1">Photo</h3>
          <p className="text-gray-500 text-xs mb-3">
            Prenez ou ajoutez une photo (facultatif)
          </p>

          {photo ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt="Photo observation"
                className="w-full object-cover max-h-56 rounded-xl"
              />
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
        </section>
      </main>

      {/* Bouton flottant Envoyer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <button
          className={`btn-terrain w-full ${peutEnvoyer ? "btn-primary" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
          disabled={!peutEnvoyer}
          onClick={handleEnvoyer}
        >
          <Send className="w-5 h-5" />
          Enregistrer l&apos;observation
        </button>
        {!peutEnvoyer && (
          <p className="text-center text-xs text-gray-400 mt-2">
            Sélectionnez le type et la zone pour continuer
          </p>
        )}
      </div>
    </div>
  );
}
