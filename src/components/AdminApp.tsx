"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  LogOut,
  QrCode,
  MapPin,
  User,
  Leaf,
  X,
  BarChart2,
  PieChart as PieChartIcon,
  List,
  Bell,
  BellRing,
  CheckCheck,
  PlusCircle,
  Send,
  Camera,
  CheckCircle,
  LayoutDashboard,
  RefreshCw,
  AlertTriangle,
  Clock,
  Users,
  Loader2,
  Filter,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";
import {
  Agent,
  EvenementSuivi,
  FiltresObservations,
  Kpis,
  LIBELLES_PRIORITES,
  LIBELLES_PROBLEMES,
  LIBELLES_STATUTS,
  LIBELLES_ZONES,
  Observation,
  PRIORITES,
  Priorite,
  STATUTS,
  StatutObservation,
  TypeProbleme,
  ZoneUsine,
  estEnRetard,
} from "@/lib/types";
import {
  Notif,
  getAgentsAdmin,
  getHistorique,
  getKpis,
  getNotifs,
  getNotifsNonLues,
  getObservations,
  getObservationsPage,
  marquerNotifLu,
  marquerToutLu,
  saveObservation,
  setRoleAgent,
  updateObservation,
  urlPhoto,
} from "@/lib/data";
import { generateId, compresserPhoto, fichierVersDataUrl, validerFichierImage } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import QRCodeCanvas from "./QRCodeCanvas";
import * as XLSX from "xlsx";

interface Props {
  agent: Agent;
  onLogout: () => void;
}

const COULEURS = [
  "#16a34a",
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#eab308",
  "#ef4444",
  "#6b7280",
  "#14b8a6",
  "#ec8899",
];

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

const ICONE: Record<string, string> = {
  fuite_huile: "🛢️",
  fuite_eau: "💧",
  fuite_matiere: "⚙️",
  dechet_mal_trie: "♻️",
  chiffon_souille: "🧹",
  epi_eparpille: "🦺",
  site_mal_arrange: "🏭",
  odeur_anormal: "💨",
  autre: "⚠️",
};

type Onglet = "tableau" | "signalements" | "graphiques" | "agents" | "qr" | "ajouter";

const TAILLE_PAGE = 15;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-TN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminApp({ agent, onLogout }: Props) {
  const [onglet, setOnglet] = useState<Onglet>("tableau");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [kpis, setKpis] = useState<Kpis>({
    total: 0,
    nouvelles: 0,
    enCours: 0,
    enRetard: 0,
    cloturees: 0,
  });
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [nonLues, setNonLues] = useState(0);

  const [lignes, setLignes] = useState<Observation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filtres, setFiltres] = useState<FiltresObservations>({});

  const [toutes, setToutes] = useState<Observation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Ajout manuel
  const [formType, setFormType] = useState<TypeProbleme | null>(null);
  const [formZone, setFormZone] = useState<ZoneUsine | null>(null);
  const [formCommentaire, setFormCommentaire] = useState("");
  const [formPhoto, setFormPhoto] = useState<string | null>(null);
  const [formAgentId, setFormAgentId] = useState("");
  const [formSucces, setFormSucces] = useState(false);

  const chargerKpis = useCallback(async () => {
    const [k, n, nl] = await Promise.all([getKpis(), getNotifs(), getNotifsNonLues()]);
    setKpis(k);
    setNotifs(n);
    setNonLues(nl);
  }, []);

  const chargerPage = useCallback(async () => {
    const resultat = await getObservationsPage(filtres, page, TAILLE_PAGE);
    setLignes(resultat.lignes);
    setTotal(resultat.total);
  }, [filtres, page]);

  const chargerTout = useCallback(async () => {
    const [obs, ag] = await Promise.all([getObservations(), getAgentsAdmin()]);
    setToutes(obs);
    setAgents(ag);
  }, []);

  const rafraichir = useCallback(async () => {
    try {
      setErreur(null);
      await Promise.all([chargerKpis(), chargerPage(), chargerTout()]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setChargement(false);
    }
  }, [chargerKpis, chargerPage, chargerTout]);

  useEffect(() => {
    const timer = setTimeout(() => {
      rafraichir();
    }, 0);
    return () => clearTimeout(timer);
  }, [rafraichir]);

  // Realtime uniquement : plus d'interrogation périodique.
  useEffect(() => {
    const canal = supabase
      .channel("ecowatch-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "observations" }, () => {
        chargerKpis();
        chargerPage();
        chargerTout();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifs" }, () => {
        chargerKpis();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [chargerKpis, chargerPage, chargerTout]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const observationCourante = useMemo(
    () => toutes.find((o) => o.id === detail) ?? lignes.find((o) => o.id === detail) ?? null,
    [detail, toutes, lignes],
  );

  const nomAgent = (id: string | null) =>
    id ? (agents.find((a) => a.id === id)?.nom ?? "—") : "Non affecté";

  const exportExcel = (source: Observation[]) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      source.map((o) => ({
        "N° suivi": o.numeroSuivi,
        Agent: o.agentNom,
        Téléphone: o.agentTelephone,
        Type: LIBELLES_PROBLEMES[o.typeProbleme],
        Zone: LIBELLES_ZONES[o.zone],
        Statut: LIBELLES_STATUTS[o.statut],
        Priorité: LIBELLES_PRIORITES[o.priorite],
        Responsable: nomAgent(o.assigneA),
        Échéance: o.echeance ? fmtDate(o.echeance) : "",
        Commentaire: o.commentaire,
        Date: fmtDate(o.dateCreation),
      })),
    );
    XLSX.utils.book_append_sheet(wb, ws, "Signalements");
    XLSX.writeFile(wb, `EcoWatch_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const stats = useMemo(() => {
    const parType: Record<string, number> = {};
    const parZone: Record<string, number> = {};
    toutes.forEach((o) => {
      parType[o.typeProbleme] = (parType[o.typeProbleme] ?? 0) + 1;
      parZone[o.zone] = (parZone[o.zone] ?? 0) + 1;
    });
    return { parType, parZone };
  }, [toutes]);

  const marquerLu = useCallback(
    async (obsId: string) => {
      const notif = notifs.find((n) => n.obsId === obsId);
      if (notif && !notif.lu) {
        await marquerNotifLu(notif.id);
        await chargerKpis();
      }
    },
    [notifs, chargerKpis],
  );

  const appliquerMiseAJour = async (
    observationId: string,
    mise: Parameters<typeof updateObservation>[1],
  ) => {
    setEnregistrement(true);
    const resultat = await updateObservation(observationId, mise);
    setEnregistrement(false);
    if (!resultat.ok) {
      setMessage(resultat.erreur ?? "Mise à jour impossible");
      return;
    }
    setMessage("Observation mise à jour");
    await rafraichir();
  };

  const handleAjoutManuel = async () => {
    if (!formType || !formZone || !formAgentId) return;
    setEnregistrement(true);

    const id = generateId();
    let cheminPhoto: string | undefined;
    if (formPhoto) {
      const { televerserPhoto } = await import("@/lib/data");
      const chemin = await televerserPhoto(formAgentId, id, formPhoto);
      if (chemin) cheminPhoto = chemin;
    }

    const agentCible = agents.find((a) => a.id === formAgentId);
    if (!agentCible) {
      setEnregistrement(false);
      setMessage("Agent introuvable");
      return;
    }

    const resultat = await saveObservation({
      id,
      numeroSuivi: "",
      agentId: formAgentId,
      agentNom: agentCible.nom,
      agentTelephone: agentCible.telephone,
      typeProbleme: formType,
      commentaire: formCommentaire.trim(),
      zone: formZone,
      photo: cheminPhoto ? undefined : formPhoto ?? undefined,
      photoPath: cheminPhoto,
      dateCreation: new Date().toISOString(),
      partage: false,
      statut: "nouvelle",
      priorite: "normale",
      assigneA: null,
      echeance: null,
      dateCloture: null,
      majLe: new Date().toISOString(),
    });

    setEnregistrement(false);

    if (!resultat.ok) {
      setMessage(resultat.erreur ?? "Enregistrement impossible");
      return;
    }

    setFormSucces(true);
    setFormType(null);
    setFormZone(null);
    setFormCommentaire("");
    setFormPhoto(null);
    setTimeout(() => setFormSucces(false), 2500);
    await rafraichir();
  };

  const handlePhotoManuelle = async (fichier: File | undefined) => {
    if (!fichier) return;
    const probleme = validerFichierImage(fichier);
    if (probleme) {
      setMessage(probleme);
      return;
    }
    const brut = await fichierVersDataUrl(fichier);
    setFormPhoto(await compresserPhoto(brut, 1000, 0.72));
  };

  const changerRole = async (a: Agent, role: "agent" | "admin") => {
    const resultat = await setRoleAgent(a.telephone, role);
    setMessage(resultat.ok ? `Rôle de ${a.nom} mis à jour` : (resultat.erreur ?? "Échec"));
    if (resultat.ok) await chargerTout();
  };

  const statsCards: { label: string; valeur: number; couleur: string; icone: React.ReactNode }[] = [
    { label: "Total", valeur: kpis.total, couleur: "text-gray-800", icone: <List className="w-5 h-5" /> },
    { label: "Nouvelles", valeur: kpis.nouvelles, couleur: "text-blue-700", icone: <BellRing className="w-5 h-5" /> },
    { label: "En cours", valeur: kpis.enCours, couleur: "text-amber-700", icone: <RefreshCw className="w-5 h-5" /> },
    { label: "En retard", valeur: kpis.enRetard, couleur: "text-red-700", icone: <AlertTriangle className="w-5 h-5" /> },
    { label: "Clôturées", valeur: kpis.cloturees, couleur: "text-green-700", icone: <CheckCircle className="w-5 h-5" /> },
  ];

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-green-700 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-1.5">
            <Leaf className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-lg leading-none">EcoWatch Admin</p>
            <p className="text-green-200 text-xs">
              {agent.nom} • Administrateur
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={rafraichir}
            className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/30"
          >
            <RefreshCw className="w-4 h-4" /> <span className="hidden sm:inline">Actualiser</span>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/30"
          >
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sortir</span>
          </button>
        </div>
      </header>

      {message && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-green-200 rounded-xl p-3 shadow-xl flex items-center gap-2 max-w-sm">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-gray-700 flex-1">{message}</p>
          <button onClick={() => setMessage(null)} aria-label="Fermer">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {erreur && (
        <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{erreur}</span>
          <button onClick={rafraichir} className="font-semibold underline">
            Réessayer
          </button>
        </div>
      )}

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 pb-28">
        {/* ══ TABLEAU DE BORD ═══════════════════════════════════ */}
        {onglet === "tableau" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {statsCards.map((c) => (
                <div key={c.label} className="bg-white rounded-2xl p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs font-semibold">
                    {c.icone}
                    {c.label}
                  </div>
                  <p className={`text-2xl font-black ${c.couleur}`}>{c.valeur}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-black text-gray-800 text-base">Derniers signalements</h2>
                <button
                  onClick={() => setOnglet("signalements")}
                  className="text-xs font-semibold text-green-700"
                >
                  Tout voir
                </button>
              </div>
              {lignes.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Aucun signalement</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {toutes.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <button
                        onClick={() => setDetail(o.id)}
                        className="w-full text-left py-2 flex items-center gap-3"
                      >
                        <span className="text-xl">{ICONE[o.typeProbleme] ?? "⚠️"}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-gray-800 truncate">
                            {o.numeroSuivi} — {LIBELLES_PROBLEMES[o.typeProbleme]}
                          </span>
                          <span className="block text-xs text-gray-500 truncate">
                            {o.agentNom} • {LIBELLES_ZONES[o.zone]} • {fmtDate(o.dateCreation)}
                          </span>
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            COULEUR_STATUT[o.statut] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {LIBELLES_STATUTS[o.statut]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ══ SIGNALEMENTS ═════════════════════════════════════ */}
        {onglet === "signalements" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {nonLues > 0 && (
                <button
                  onClick={async () => {
                    await marquerToutLu();
                    await chargerKpis();
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-green-700"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Tout marquer lu ({nonLues})
                </button>
              )}
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="input-terrain py-1.5"
                value={filtres.statut ?? ""}
                onChange={(e) => {
                  setPage(0);
                  setFiltres((f) => ({ ...f, statut: e.target.value as StatutObservation | "" }));
                }}
                aria-label="Filtrer par statut"
              >
                <option value="">Tous statuts</option>
                {STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES_STATUTS[s]}
                  </option>
                ))}
              </select>
              <select
                className="input-terrain py-1.5"
                value={filtres.priorite ?? ""}
                onChange={(e) => {
                  setPage(0);
                  setFiltres((f) => ({ ...f, priorite: e.target.value as Priorite | "" }));
                }}
                aria-label="Filtrer par priorité"
              >
                <option value="">Toutes priorités</option>
                {PRIORITES.map((p) => (
                  <option key={p} value={p}>
                    {LIBELLES_PRIORITES[p]}
                  </option>
                ))}
              </select>
              <select
                className="input-terrain py-1.5"
                value={filtres.zone ?? ""}
                onChange={(e) => {
                  setPage(0);
                  setFiltres((f) => ({ ...f, zone: e.target.value as ZoneUsine | "" }));
                }}
                aria-label="Filtrer par zone"
              >
                <option value="">Toutes zones</option>
                {Object.entries(LIBELLES_ZONES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="input-terrain py-1.5"
                value={filtres.type ?? ""}
                onChange={(e) => {
                  setPage(0);
                  setFiltres((f) => ({ ...f, type: e.target.value as TypeProbleme | "" }));
                }}
                aria-label="Filtrer par type"
              >
                <option value="">Tous types</option>
                {Object.entries(LIBELLES_PROBLEMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="input-terrain py-1.5"
                value={filtres.agentId ?? ""}
                onChange={(e) => {
                  setPage(0);
                  setFiltres((f) => ({ ...f, agentId: e.target.value || undefined }));
                }}
                aria-label="Filtrer par agent"
              >
                <option value="">Tous agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom}
                  </option>
                ))}
              </select>
              <input
                className="input-terrain py-1.5 flex-1 min-w-[10rem]"
                placeholder="Rechercher (n°, agent, commentaire)"
                value={filtres.recherche ?? ""}
                onChange={(e) => {
                  setPage(0);
                  setFiltres((f) => ({ ...f, recherche: e.target.value }));
                }}
                aria-label="Rechercher"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={Boolean(filtres.enRetardSeulement)}
                  onChange={(e) => {
                    setPage(0);
                    setFiltres((f) => ({ ...f, enRetardSeulement: e.target.checked }));
                  }}
                />
                En retard
              </label>
              <button
                onClick={() => exportExcel(lignes)}
                className="btn-terrain btn-secondary py-1.5 text-xs"
              >
                Exporter
              </button>
            </div>

            {chargement ? (
              <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Chargement…
              </div>
            ) : lignes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <Bell className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 font-semibold">Aucun signalement pour ces filtres</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lignes.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setDetail(o.id)}
                    className="w-full text-left bg-white rounded-2xl p-3 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{ICONE[o.typeProbleme] ?? "⚠️"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-sm text-gray-800 truncate">
                            {LIBELLES_PROBLEMES[o.typeProbleme]}
                          </p>
                          <span className="text-[11px] font-mono text-gray-400">{o.numeroSuivi}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-green-600" />
                            {o.agentNom}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-green-600" />
                            {LIBELLES_ZONES[o.zone]}
                          </span>
                          <span>{fmtDate(o.dateCreation)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              COULEUR_STATUT[o.statut] ?? "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {LIBELLES_STATUTS[o.statut]}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            Priorité {LIBELLES_PRIORITES[o.priorite]}
                          </span>
                          {estEnRetard(o) && (
                            <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> En retard
                            </span>
                          )}
                          {o.assigneA && (
                            <span className="text-[11px] text-gray-500">
                              → {nomAgent(o.assigneA)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {pages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  className="btn-terrain btn-secondary py-1 px-3"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">
                  Page {page + 1} / {pages} — {total} signalement(s)
                </span>
                <button
                  className="btn-terrain btn-secondary py-1 px-3"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Page suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ GRAPHIQUES ═══════════════════════════════════════ */}
        {onglet === "graphiques" && (
          <div className="space-y-6">
            <h2 className="font-black text-gray-800 text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Statistiques
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4" /> Par type de problème
                </h3>
                {Object.keys(stats.parType).length === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(stats.parType).map(([k, v]) => ({
                          name: LIBELLES_PROBLEMES[k as TypeProbleme],
                          value: v,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {Object.entries(stats.parType).map((_, i) => (
                          <Cell key={i} fill={COULEURS[i % COULEURS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4">Par zone</h3>
                {Object.keys(stats.parZone).length === 0 ? (
                  <p className="text-sm text-gray-400 py-10 text-center">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={Object.entries(stats.parZone).map(([k, v]) => ({
                        zone: LIBELLES_ZONES[k as ZoneUsine],
                        count: v as number,
                      }))}
                      layout="vertical"
                    >
                      <XAxis type="number" dataKey="count" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="zone" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => exportExcel(toutes)} className="btn-terrain btn-secondary text-sm">
                Exporter tout (Excel)
              </button>
            </div>
          </div>
        )}

        {/* ══ AGENTS ═══════════════════════════════════════════ */}
        {onglet === "agents" && (
          <div className="space-y-3">
            <h2 className="font-black text-gray-800 text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Agents ({agents.length})
            </h2>
            <p className="text-xs text-gray-500">
              Le rôle administrateur s&apos;applique immédiatement : la base fait foi, le jeton de
              connexion n&apos;est plus utilisé pour autoriser les actions.
            </p>
            {agents.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">Aucun agent enregistré</p>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
                {agents.map((a) => (
                  <div key={a.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{a.nom}</p>
                      <p className="text-xs text-gray-500">{a.telephone}</p>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        a.role === "admin"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {a.role === "admin" ? "Administrateur" : "Agent"}
                    </span>
                    {a.role === "admin" ? (
                      <button
                        onClick={() => changerRole(a, "agent")}
                        disabled={enregistrement}
                        className="text-xs font-semibold text-red-600 disabled:opacity-50"
                      >
                        Rétrograder
                      </button>
                    ) : (
                      <button
                        onClick={() => changerRole(a, "admin")}
                        disabled={enregistrement}
                        className="text-xs font-semibold text-green-700 disabled:opacity-50"
                      >
                        Promouvoir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ QR CODE ══════════════════════════════════════════ */}
        {onglet === "qr" && (
          <div className="text-center space-y-4">
            <h2 className="font-black text-gray-800 text-base">QR Code d&apos;accès agents</h2>
            <p className="text-gray-500 text-sm">Scannez pour ouvrir l&apos;application</p>
            <QRCodeCanvas />
            <p className="text-xs text-gray-400">
              URL&nbsp;: https://animated-kashata-2eeaea.netlify.app
            </p>
          </div>
        )}

        {/* ══ AJOUT MANUEL ═════════════════════════════════════ */}
        {onglet === "ajouter" && (
          <div className="space-y-4 max-w-md mx-auto">
            <h2 className="font-black text-gray-800 text-base text-center flex items-center justify-center gap-2">
              <PlusCircle className="w-4 h-4" /> Ajout manuel
            </h2>
            {formSucces && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-green-700">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="font-semibold">Signalement ajouté</p>
              </div>
            )}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
              <select
                className="input-terrain"
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
                aria-label="Agent déclarant"
              >
                <option value="">Agent déclarant *</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom} — {a.telephone}
                  </option>
                ))}
              </select>
              <select
                className="input-terrain"
                value={formType ?? ""}
                onChange={(e) => setFormType(e.target.value as TypeProbleme)}
                aria-label="Type de problème"
              >
                <option value="">Type *</option>
                {Object.entries(LIBELLES_PROBLEMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                className="input-terrain"
                value={formZone ?? ""}
                onChange={(e) => setFormZone(e.target.value as ZoneUsine)}
                aria-label="Zone"
              >
                <option value="">Zone *</option>
                {Object.entries(LIBELLES_ZONES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <textarea
                className="input-terrain resize-none"
                rows={3}
                placeholder="Commentaire"
                value={formCommentaire}
                onChange={(e) => setFormCommentaire(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="btn-terrain btn-secondary cursor-pointer">
                  <Camera className="w-5 h-5 mx-auto" /> Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoManuelle(e.target.files?.[0])}
                  />
                </label>
                <button
                  className="btn-terrain btn-secondary"
                  onClick={() => setFormPhoto(null)}
                  disabled={!formPhoto}
                >
                  <X className="w-5 h-5 mx-auto" /> Retirer
                </button>
              </div>
              {formPhoto && <img src={formPhoto} alt="Aperçu" className="max-h-40 rounded-xl mx-auto" />}
              <button
                className="btn-terrain btn-primary w-full"
                onClick={handleAjoutManuel}
                disabled={!formType || !formZone || !formAgentId || enregistrement}
              >
                {enregistrement ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 flex justify-around z-10">
        {[
          { id: "tableau", label: "Tableau", icon: <LayoutDashboard className="w-6 h-6" />, badge: 0 },
          {
            id: "signalements",
            label: "Alertes",
            icon: nonLues > 0 ? <BellRing className="w-6 h-6" /> : <Bell className="w-6 h-6" />,
            badge: nonLues,
          },
          { id: "graphiques", label: "Stats", icon: <BarChart2 className="w-6 h-6" />, badge: 0 },
          { id: "agents", label: "Agents", icon: <Users className="w-6 h-6" />, badge: 0 },
          { id: "qr", label: "QR", icon: <QrCode className="w-6 h-6" />, badge: 0 },
          { id: "ajouter", label: "Ajouter", icon: <PlusCircle className="w-6 h-6" />, badge: 0 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setOnglet(tab.id as Onglet)}
            className={`flex flex-col items-center gap-1 text-[11px] transition-colors px-1 ${
              onglet === tab.id ? "text-green-600" : "text-gray-400 hover:text-green-600"
            }`}
          >
            <div className="relative">
              {tab.icon}
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </div>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {observationCourante && (
        <DetailObservation
          key={observationCourante.id}
          observation={observationCourante}
          agents={agents}
          nomAgent={nomAgent}
          enregistrement={enregistrement}
          onClose={() => setDetail(null)}
          onMarquerLu={marquerLu}
          onMaj={appliquerMiseAJour}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Détail d'une observation (panneau latéral)
// ─────────────────────────────────────────────────────────────
function DetailObservation({
  observation,
  agents,
  nomAgent,
  enregistrement,
  onClose,
  onMarquerLu,
  onMaj,
}: {
  observation: Observation;
  agents: Agent[];
  nomAgent: (id: string | null) => string;
  enregistrement: boolean;
  onClose: () => void;
  onMarquerLu: (obsId: string) => Promise<void>;
  onMaj: (id: string, mise: Parameters<typeof updateObservation>[1]) => Promise<void>;
}) {
  const [photo, setPhoto] = useState<string | undefined>(observation.photo);
  const [historique, setHistorique] = useState<EvenementSuivi[] | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [echeance, setEcheance] = useState(
    observation.echeance ? observation.echeance.slice(0, 10) : "",
  );

  useEffect(() => {
    let actif = true;
    if (!observation.photo && observation.photoPath) {
      urlPhoto(observation.photoPath).then((u) => {
        if (actif && u) setPhoto(u);
      });
    }
    return () => {
      actif = false;
    };
  }, [observation.id, observation.photo, observation.photoPath]);

  // L'ouverture du détail marque la notification comme lue.
  useEffect(() => {
    onMarquerLu(observation.id);
  }, [observation.id, onMarquerLu]);

  useEffect(() => {
    let actif = true;
    getHistorique(observation.id)
      .then((h) => {
        if (actif) setHistorique(h);
      })
      .catch(() => {
        if (actif) setHistorique([]);
      });
    return () => {
      actif = false;
    };
  }, [observation.id, observation.majLe]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl">
        <header className="sticky top-0 bg-green-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-black text-base leading-none">{observation.numeroSuivi}</p>
            <p className="text-green-200 text-xs">{LIBELLES_PROBLEMES[observation.typeProbleme]}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="bg-white/20 rounded-xl p-2">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {LIBELLES_STATUTS[observation.statut]}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              Priorité {LIBELLES_PRIORITES[observation.priorite]}
            </span>
            {estEnRetard(observation) && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                En retard
              </span>
            )}
          </div>

          <dl className="text-sm space-y-1">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Agent</dt>
              <dd className="text-gray-800">
                {observation.agentNom} — {observation.agentTelephone}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Zone</dt>
              <dd className="text-gray-800">{LIBELLES_ZONES[observation.zone]}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Déclaré le</dt>
              <dd className="text-gray-800">{fmtDate(observation.dateCreation)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Dernière mise à jour</dt>
              <dd className="text-gray-800">{fmtDate(observation.majLe)}</dd>
            </div>
          </dl>

          {observation.commentaire && (
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-line">
              {observation.commentaire}
            </div>
          )}

          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Photo" className="w-full max-h-64 object-cover rounded-xl" />
          )}

          {/* Suivi */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-800">Traitement</h3>
            <label className="block text-xs text-gray-500">
              Statut
              <select
                className="input-terrain mt-1"
                value={observation.statut}
                disabled={enregistrement}
                onChange={(e) =>
                  onMaj(observation.id, { statut: e.target.value as StatutObservation })
                }
              >
                {STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES_STATUTS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-500">
              Priorité
              <select
                className="input-terrain mt-1"
                value={observation.priorite}
                disabled={enregistrement}
                onChange={(e) => onMaj(observation.id, { priorite: e.target.value as Priorite })}
              >
                {PRIORITES.map((p) => (
                  <option key={p} value={p}>
                    {LIBELLES_PRIORITES[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-500">
              Responsable
              <select
                className="input-terrain mt-1"
                value={observation.assigneA ?? ""}
                disabled={enregistrement}
                onChange={(e) => onMaj(observation.id, { assigneA: e.target.value })}
              >
                <option value="">Non affecté</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-500">
              Échéance
              <input
                type="date"
                className="input-terrain mt-1"
                value={echeance}
                disabled={enregistrement}
                onChange={(e) => {
                  setEcheance(e.target.value);
                  if (e.target.value) {
                    onMaj(observation.id, {
                      echeance: new Date(e.target.value).toISOString(),
                    });
                  } else {
                    onMaj(observation.id, { effacerEcheance: true });
                  }
                }}
              />
            </label>

            <label className="block text-xs text-gray-500">
              Ajouter un commentaire de traitement
              <textarea
                className="input-terrain mt-1 resize-none"
                rows={2}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Ex : fuite colmatée, contrôle effectué…"
              />
            </label>
            <button
              className="btn-terrain btn-primary w-full"
              disabled={enregistrement || commentaire.trim().length === 0}
              onClick={async () => {
                await onMaj(observation.id, { commentaire });
                setCommentaire("");
              }}
            >
              Enregistrer le commentaire
            </button>
          </section>

          {/* Historique */}
          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1">
              <History className="w-4 h-4" /> Historique des interventions
            </h3>
            {historique === null ? (
              <p className="text-xs text-gray-400">Chargement…</p>
            ) : historique.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun évènement.</p>
            ) : (
              <ol className="space-y-2 border-l-2 border-green-100 pl-3">
                {historique.map((e) => (
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
            )}
          </section>

          <p className="text-[11px] text-gray-400">
            Responsable actuel : {nomAgent(observation.assigneA)}
          </p>
        </div>
      </aside>
    </div>
  );
}