"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  PlusCircle,
  Calendar,
  MapPin,
  MessageSquare,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { Agent, Observation, LIBELLES_PROBLEMES, LIBELLES_ZONES, TypeProbleme } from "@/lib/types";
import { getObservationsByAgent } from "@/lib/store";
import BoutonPartage from "./BoutonPartage";

interface Props {
  agent: Agent;
  onRetour: () => void;
  onNouvelle: () => void;
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

export default function MesSignalements({ agent, onRetour, onNouvelle }: Props) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setObservations(getObservationsByAgent(agent.id));
    }, 0);
    return () => clearTimeout(id);
  }, [agent.id]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("fr-TN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTextePartage = (obs: Observation) => {
    return (
      `🌿 EcoWatch – Signalement\n` +
      `👤 Agent: ${obs.agentNom}\n` +
      `📍 Zone: ${LIBELLES_ZONES[obs.zone]}\n` +
      `⚠️ Type: ${LIBELLES_PROBLEMES[obs.typeProbleme]}\n` +
      (obs.commentaire ? `💬 Note: ${obs.commentaire}\n` : "") +
      `📅 Date: ${formatDate(obs.dateCreation)}`
    );
  };

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
        <div className="flex-1">
          <p className="font-black text-lg leading-none">Mes Signalements</p>
          <p className="text-green-200 text-xs">{observations.length} observation(s)</p>
        </div>
        <button
          onClick={onNouvelle}
          className="bg-white/20 rounded-xl p-2 hover:bg-white/30 transition-colors"
        >
          <PlusCircle className="w-6 h-6" />
        </button>
      </header>

      <main className="flex-1 px-4 py-5 pb-8">
        {observations.length === 0 ? (
          <div className="text-center py-20">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-400 font-semibold text-lg">
              Aucun signalement pour l&apos;instant
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Appuyez sur + pour créer votre première observation
            </p>
            <button
              className="btn-terrain btn-primary mt-6 mx-auto px-8"
              onClick={onNouvelle}
              style={{ width: "auto" }}
            >
              <PlusCircle className="w-5 h-5" />
              Nouvelle observation
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {observations.map((obs) => (
              <div key={obs.id} className="obs-card">
                {/* En-tête */}
                <div className="flex items-start justify-between mb-2">
                  <span className={`badge ${COULEUR_BADGE[obs.typeProbleme]}`}>
                    {LIBELLES_PROBLEMES[obs.typeProbleme]}
                  </span>
                </div>

                {/* Zone & date */}
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {LIBELLES_ZONES[obs.zone]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(obs.dateCreation)}
                  </span>
                </div>

                {/* Commentaire */}
                {obs.commentaire && (
                  <p className="text-gray-700 text-sm mb-2 bg-gray-50 rounded-lg p-2">
                    {obs.commentaire}
                  </p>
                )}

                {/* Photo miniature */}
                {obs.photo && (
                  <button
                    onClick={() => setPhotoPreview(obs.photo!)}
                    className="mb-2 block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={obs.photo}
                      alt="Photo"
                      className="w-full max-h-36 object-cover rounded-xl border border-gray-200"
                    />
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> Appuyer pour agrandir
                    </p>
                  </button>
                )}

                {/* Actions partage */}
                <div className="mt-3">
                  <BoutonPartage
                    texte={getTextePartage(obs)}
                    sujetEmail={`EcoWatch – ${LIBELLES_PROBLEMES[obs.typeProbleme]} – ${LIBELLES_ZONES[obs.zone]}`}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal photo */}
      {photoPreview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPhotoPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPreview}
            alt="Photo agrandie"
            className="max-w-full max-h-full rounded-2xl"
          />
          <button
            className="absolute top-5 right-5 bg-white text-black rounded-full p-2 shadow-xl"
            onClick={() => setPhotoPreview(null)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
