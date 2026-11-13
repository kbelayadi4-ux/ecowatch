"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  PlusCircle,
  Calendar,
  MapPin,
  MessageSquare,
  Image as ImageIcon,
  X,
  RefreshCw,
  History,
  Clock,
  CheckCircle2,
  UserCog,
} from "lucide-react";
import {
  Agent,
  EvenementSuivi,
  LIBELLES_PRIORITES,
  LIBELLES_PROBLEMES,
  LIBELLES_STATUTS,
  LIBELLES_ZONES,
  Observation,
  TypeProbleme,
  estEnRetard,
} from "@/lib/types";
import { getHistorique, getObservationsByAgent, urlPhoto } from "@/lib/data";
import { supabase } from "@/lib/supabase";
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

const COULEUR_STATUT: Record<string, string> = {
  nouvelle: "bg-blue-100 text-blue-700",
  en_analyse: "bg-amber-100 text-amber-700",
  action_en_cours: "bg-orange-100 text-orange-700",
  attente_verification: "bg-purple-100 text-purple-700",
  cloturee: "bg-green-100 text-green-700",
};

function PhotoObservation({ obs }: { obs: Observation }) {
  const [src, setSrc] = useState<string | undefined>(obs.photo);
  const [plein, setPlein] = useState(false);

  useEffect(() => {
    let actif = true;
    if (!obs.photo && obs.photoPath) {
      urlPhoto(obs.photoPath).then((u) => {
        if (actif && u) setSrc(u);
      });
    }
    return () => {
      actif = false;
    };
  }, [obs.photo, obs.photoPath]);

  if (!src) return null;

  return (
    <>
      <button onClick={() => setPlein(true)} className="mb-2 block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Photo du signalement ${obs.numeroSuivi}`}
          className="w-full max-h-40 object-cover rounded-xl border border-gray-200"
        />
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <ImageIcon className="w-3 h-3" /> Appuyer pour agrandir
        </p>
      </button>

      {plein && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPlein(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Photo agrandie" className="max-w-full max-h-full rounded-2xl" />
          <button
            className="absolute top-5 right-5 bg-white text-black rounded-full p-2 shadow-xl"
            onClick={() => setPlein(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
}

function Historique({ observationId }: { observationId: string }) {
  const [evenements, setEvenements] = useState<EvenementSuivi[] | null>(null);

  useEffect(() => {
    let actif = true;
    getHistorique(observationId)
      .then((h) => {
        if (actif) setEvenements(h);
      })
      .catch(() => {
        if (actif) setEvenements([]);
      });
    return () => {
      actif = false;
    };
  }, [observationId]);

  if (evenements === null) {
    return <p className="text-xs text-gray-400">Chargement de l&apos;historique…</p>;
  }

  if (evenements.length === 0) {
    return <p className="text-xs text-gray-400">Aucun évènement enregistré.</p>;
  }

  return (
    <ol className="space-y-2 border-l-2 border-green-100 pl-3">
      {evenements.map((e) => (
        <li key={e.id} className="text-xs text-gray-600">
          <span className="font-semibold text-gray-700">
            {new Date(e.creeLe).toLocaleString("fr-TN", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {" — "}
          {e.resume ?? e.action}
          <span className="text-gray-400"> ({e.auteurNom ?? "Système"})</span>
        </li>
      ))}
    </ol>
  );
}

export default function MesSignalements({ agent, onRetour, onNouvelle }: Props) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      const obs = await getObservationsByAgent(agent.id);
      setObservations(obs);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setChargement(false);
    }
  }, [agent.id]);

  useEffect(() => {
    let actif = true;
    const timer = setTimeout(() => {
      if (actif) charger();
    }, 0);
    return () => {
      actif = false;
      clearTimeout(timer);
    };
  }, [charger]);

  // Temps réel : un changement de statut côté administration apparaît ici
  // sans rechargement manuel.
  useEffect(() => {
    const canal = supabase
      .channel(`ecowatch-agent-${agent.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observations" },
        () => charger(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifs" }, () => charger())
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [agent.id, charger]);

  const formaterDate = (iso: string) =>
    new Date(iso).toLocaleString("fr-TN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const textePartage = (obs: Observation) =>
    `🌿 EcoWatch – Signalement ${obs.numeroSuivi}\n` +
    `👤 Agent: ${obs.agentNom}\n` +
    `📍 Zone: ${LIBELLES_ZONES[obs.zone]}\n` +
    `⚠️ Type: ${LIBELLES_PROBLEMES[obs.typeProbleme]}\n` +
    `📊 Statut: ${LIBELLES_STATUTS[obs.statut]}\n` +
    (obs.commentaire ? `💬 Note: ${obs.commentaire}\n` : "") +
    `📅 Date: ${formaterDate(obs.dateCreation)}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-green-700 text-white px-5 py-4 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <button
          onClick={onRetour}
          className="bg-white/20 rounded-xl p-2 hover:bg-white/30 transition-colors"
          aria-label="Retour"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <p className="font-black text-lg leading-none">Mes Signalements</p>
          <p className="text-green-200 text-xs">{observations.length} observation(s)</p>
        </div>
        <button
          onClick={charger}
          className="bg-white/20 rounded-xl p-2 hover:bg-white/30 transition-colors"
          aria-label="Actualiser"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
        <button
          onClick={onNouvelle}
          className="bg-white/20 rounded-xl p-2 hover:bg-white/30 transition-colors"
          aria-label="Nouvelle observation"
        >
          <PlusCircle className="w-6 h-6" />
        </button>
      </header>

      <main className="flex-1 px-4 py-5 pb-8">
        {erreur && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erreur}
            <button onClick={charger} className="ml-2 font-semibold underline">
              Réessayer
            </button>
          </div>
        )}

        {chargement ? (
          <div className="text-center py-20 text-gray-400">Chargement…</div>
        ) : observations.length === 0 ? (
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
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${COULEUR_BADGE[obs.typeProbleme]}`}>
                      {LIBELLES_PROBLEMES[obs.typeProbleme]}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        COULEUR_STATUT[obs.statut] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {LIBELLES_STATUTS[obs.statut]}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-gray-400">{obs.numeroSuivi}</span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-2 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {LIBELLES_ZONES[obs.zone]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formaterDate(obs.dateCreation)}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserCog className="w-3.5 h-3.5" />
                    {LIBELLES_PRIORITES[obs.priorite]}
                  </span>
                </div>

                {obs.echeance && (
                  <p
                    className={`text-xs mb-2 flex items-center gap-1 ${
                      estEnRetard(obs) ? "text-red-600 font-semibold" : "text-gray-500"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Échéance : {formaterDate(obs.echeance)}
                    {estEnRetard(obs) ? " — en retard" : ""}
                  </p>
                )}

                {obs.commentaire && (
                  <p className="text-gray-700 text-sm mb-2 bg-gray-50 rounded-lg p-2">
                    {obs.commentaire}
                  </p>
                )}

                <PhotoObservation obs={obs} />

                <button
                  onClick={() => setDetail(detail === obs.id ? null : obs.id)}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-green-700"
                >
                  {obs.statut === "cloturee" ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <History className="w-3.5 h-3.5" />
                  )}
                  {detail === obs.id ? "Masquer le suivi" : "Voir le suivi"}
                </button>

                {detail === obs.id && (
                  <div className="mt-2 rounded-xl bg-gray-50 p-3">
                    <Historique observationId={obs.id} />
                  </div>
                )}

                <div className="mt-3">
                  <BoutonPartage
                    texte={textePartage(obs)}
                    sujetEmail={`EcoWatch – ${LIBELLES_PROBLEMES[obs.typeProbleme]} – ${LIBELLES_ZONES[obs.zone]}`}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}