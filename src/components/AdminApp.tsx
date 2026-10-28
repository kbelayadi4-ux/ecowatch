"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from "recharts";
import {
  LogOut, Download, QrCode, Calendar, MapPin, User,
  Filter, X, Image as ImageIcon, BarChart2,
  PieChart as PieChartIcon, List, Bell, BellRing, CheckCheck,
  PlusCircle, Send, Camera, CheckCircle,
} from "lucide-react";
import {
  Agent, Observation, LIBELLES_PROBLEMES, LIBELLES_ZONES, TypeProbleme, ZoneUsine,
  StatutAnomalie, PrioriteAnomalie, LIBELLES_STATUTS, LIBELLES_PRIORITES,
} from "@/lib/types";
import { getObservations, clearSession, getNotifs, getNotifsNonLues,
  marquerToutLu, ECO_NEW_OBS_EVENT, Notif,
} from "@/lib/store";
import { fetchObservations, migrateLocalToSupabase, updateObservation } from "@/lib/data";

import QRCodeCanvas from "./QRCodeCanvas";
import * as XLSX from "xlsx";

interface Props {
  agent: Agent;
  onLogout: () => void;
}

const COULEURS = ["#16a34a","#f97316","#3b82f6","#a855f7","#eab308","#ef4444","#6b7280","#14b8a6","#ec4899"];

const COULEUR_BADGE: Record<TypeProbleme, string> = {
  fuite_huile: "badge-orange", fuite_eau: "badge-blue", fuite_matiere: "badge-purple",
  dechet_mal_trie: "badge-green", chiffon_souille: "badge-yellow", epi_eparpille: "badge-yellow",
  site_mal_arrange: "badge-gray", odeur_anormal: "badge-red", autre: "badge-gray",
};

const ICONE: Record<string, string> = {
  fuite_huile:"🛢️", fuite_eau:"💧", fuite_matiere:"⚗️", dechet_mal_trie:"♻️",
  chiffon_souille:"🧹", epi_eparpille:"🦺", site_mal_arrange:"🏭", odeur_anormal:"💨", autre:"⚠️",
};

type Onglet = "notifs" | "graphiques" | "liste" | "qr" | "ajouter";

export default function AdminApp({ agent, onLogout }: Props) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [onglet, setOnglet] = useState<Onglet>("notifs");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [filtreZone, setFiltreZone] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [toast, setToast] = useState<Notif | null>(null);
  
  // Formulaire ajout manuel
  const [formType, setFormType] = useState<TypeProbleme | null>(null);
  const [formZone, setFormZone] = useState<ZoneUsine | null>(null);
  const [formCommentaire, setFormCommentaire] = useState("");
  const [formPhoto, setFormPhoto] = useState<string | null>(null);
  const [formAgentNom, setFormAgentNom] = useState("");
  const [formSucces, setFormSucces] = useState(false);

  // ── Rechargement des données ─────────────────────────────────
  const charger = useCallback(async () => {
    try {
      const obs = await fetchObservations();
      setObservations(obs);
    } catch {
      setObservations(getObservations());
    }
    setNotifs(getNotifs());
    setNonLues(getNotifsNonLues());
  }, []);

  useEffect(() => {
    // Chargement immédiat au montage (différé légèrement pour éviter le warning lint)
    const init = setTimeout(() => charger(), 0);
    // Polling toutes les 2 secondes (plus réactif)
    const interval = setInterval(() => charger(), 2000);
    return () => { clearTimeout(init); clearInterval(interval); };
  }, [charger]);

  // ── Écoute des événements temps réel (même onglet) ──────────
  useEffect(() => {
    const handleNewObs = (e: Event) => {
      const obs = (e as CustomEvent<Notif>).detail;
      charger();
      // Afficher toast 4 secondes
      setToast(obs as unknown as Notif);
      setTimeout(() => setToast(null), 4000);
    };
    // Même onglet
    window.addEventListener(ECO_NEW_OBS_EVENT, handleNewObs);
    // Autres onglets (storage event)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "eco_observations" || e.key === "eco_notifs") charger();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(ECO_NEW_OBS_EVENT, handleNewObs);
      window.removeEventListener("storage", handleStorage);
    };
  }, [charger]);

  const [obsSelectionnee, setObsSelectionnee] = useState<Observation | null>(null);
  const [traitStatut, setTraitStatut] = useState<StatutAnomalie>("nouvelle");
  const [traitPriorite, setTraitPriorite] = useState<PrioriteAnomalie>("moyenne");
  const [traitResponsable, setTraitResponsable] = useState("");
  const [traitEcheance, setTraitEcheance] = useState("");
  const [traitAnalyse, setTraitAnalyse] = useState("");
  const [traitMesures, setTraitMesures] = useState("");
  const [traitActions, setTraitActions] = useState("");
  const [traitVerification, setTraitVerification] = useState("");
  const [traitEnCours, setTraitEnCours] = useState(false);
  const ouvrirTraitement = (obs: Observation) => {
    setObsSelectionnee(obs);
    setTraitStatut(obs.statut);
    setTraitPriorite(obs.priorite);
    setTraitResponsable(obs.responsable || "");
    setTraitEcheance(obs.echeance ? obs.echeance.slice(0, 10) : "");
    setTraitAnalyse(obs.analyseCause || "");
    setTraitMesures(obs.mesuresImmediates || "");
    setTraitActions(obs.actionsCorrectives || "");
    setTraitVerification(obs.verificationEfficacite || "");
  };

  const sauverTraitement = async () => {
    if (!obsSelectionnee) return;
    setTraitEnCours(true);
    const hist = [...(obsSelectionnee.historique || [])];
    if (traitStatut !== obsSelectionnee.statut) {
      hist.push({ date: new Date().toISOString(), utilisateur: agent.nom, action: "Changement de statut", ancienneValeur: obsSelectionnee.statut, nouvelleValeur: traitStatut });
    }
    if (traitPriorite !== obsSelectionnee.priorite) {
      hist.push({ date: new Date().toISOString(), utilisateur: agent.nom, action: "Changement de priorité", ancienneValeur: obsSelectionnee.priorite, nouvelleValeur: traitPriorite });
    }
    try {
      await updateObservation(obsSelectionnee.id, {
        statut: traitStatut,
        priorite: traitPriorite,
        responsable: traitResponsable || undefined,
        echeance: traitEcheance ? new Date(traitEcheance).toISOString() : undefined,
        analyseCause: traitAnalyse || undefined,
        mesuresImmediates: traitMesures || undefined,
        actionsCorrectives: traitActions || undefined,
        verificationEfficacite: traitVerification || undefined,
        historique: hist,
      });
      setObsSelectionnee(null);
      charger();
    } catch (e) {
      alert(`Erreur: ${String(e)}`);
    } finally {
      setTraitEnCours(false);
    }
  };
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const handleLogout = () => { clearSession(); onLogout(); };
  const exporterPDF = () => {
    const rows = listeFiltree.map((o) => `<tr><td>${o.numeroSuivi}</td><td>${LIBELLES_PROBLEMES[o.typeProbleme]}</td><td>${LIBELLES_ZONES[o.zone]}</td><td>${LIBELLES_STATUTS[o.statut]}</td><td>${LIBELLES_PRIORITES[o.priorite]}</td><td>${o.responsable || "-"}</td><td>${o.echeance ? new Date(o.echeance).toLocaleDateString("fr-TN") : "-"}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport EcoWatch</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#16a34a;color:#fff}</style></head><body><h1>Rapport EcoWatch</h1><p>Période: ${listeFiltree.length} observation(s)</p><table><thead><tr><th>N°</th><th>Type</th><th>Zone</th><th>Statut</th><th>Priorité</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };
  const handleMigration = async () => {
    try {
      const r = await migrateLocalToSupabase();
      setMigrationResult(`Total ${r.total}, importés ${r.imported}, ignorés ${r.skipped}, erreurs ${r.errors}`);
      charger();
    } catch (e) {
      setMigrationResult(`Erreur: ${String(e)}`);
    }
  };

  const ouvrirNotifs = () => {
    setOnglet("notifs");
    marquerToutLu();
    setNonLues(0);
  };

  // ── Graphique barres ─────────────────────────────────────────
  const donneesParJour = useMemo(() => {
    const map: Record<string, number> = {};
    observations.forEach((obs) => {
      const d = new Date(obs.dateCreation).toLocaleDateString("fr-TN", { day: "2-digit", month: "2-digit" });
      map[d] = (map[d] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([date, total]) => ({ date, total }));
  }, [observations]);

  // ── Camembert ────────────────────────────────────────────────
  const donneesCamembert = useMemo(() => {
    const map: Record<string, number> = {};
    observations.forEach((obs) => {
      const label = LIBELLES_PROBLEMES[obs.typeProbleme];
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [observations]);

  // ── Filtres ──────────────────────────────────────────────────
  const listeFiltree = useMemo(() =>
    observations.filter((obs) => {
      if (filtreZone && obs.zone !== filtreZone) return false;
      if (filtreType && obs.typeProbleme !== filtreType) return false;
      return true;
    }),
    [observations, filtreZone, filtreType]
  );

  // ── KPIs ─────────────────────────────────────────────────────
  const kpisEtendus = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const nonCloturees = observations.filter((o) => o.statut !== "cloturee");
    const enRetard = nonCloturees.filter((o) => o.echeance && new Date(o.echeance) < now).length;
    const proches = nonCloturees.filter((o) => o.echeance && new Date(o.echeance) >= now && new Date(o.echeance) <= in7).length;
    const cloturees = observations.filter((o) => o.statut === "cloturee").length;
    const tauxCloture = observations.length ? Math.round((cloturees / observations.length) * 100) : 0;
    let sumPrise = 0, countPrise = 0, sumResol = 0, countResol = 0;
    observations.forEach((o) => {
      const creation = new Date(o.dateCreation).getTime();
      const firstTrait = (o.historique || []).find((h) => h.action === "Changement de statut" && h.nouvelleValeur && h.nouvelleValeur !== "nouvelle");
      if (firstTrait) { sumPrise += new Date(firstTrait.date).getTime() - creation; countPrise++; }
      if (o.statut === "cloturee") {
        const clot = (o.historique || []).find((h) => h.action === "Changement de statut" && h.nouvelleValeur === "cloturee");
        if (clot) { sumResol += new Date(clot.date).getTime() - creation; countResol++; }
      }
    });
    const delaiPrise = countPrise ? Math.round(sumPrise / countPrise / 86400000 * 10) / 10 : null;
    const delaiResol = countResol ? Math.round(sumResol / countResol / 86400000 * 10) / 10 : null;
    return { enRetard, proches, cloturees, tauxCloture, delaiPrise, delaiResol };
  }, [observations]);

  const kpis = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return {
      total: observations.length,
      aujourdhui: observations.filter((o) => new Date(o.dateCreation).toDateString() === todayStr).length,
      semaine: observations.filter((o) => now.getTime() - new Date(o.dateCreation).getTime() <= weekMs).length,
      avecPhoto: observations.filter((o) => o.photo).length,
    };
  }, [observations]);

  // ── Ajout manuel ───────────────────────────────────────────────
  const handleAjoutManuel = () => {
    if (!formType || !formZone || !formAgentNom.trim()) return;
    
    const nouvelleObs: Observation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      numeroSuivi: "",
      agentId: "admin-manuel",
      agentNom: formAgentNom.trim(),
      agentTelephone: "00000000",
      typeProbleme: formType,
      commentaire: formCommentaire.trim(),
      zone: formZone,
      photo: formPhoto || undefined,
      dateCreation: new Date().toISOString(),
      partage: false,
      statut: "nouvelle",
      priorite: "moyenne",
      commentaires: [],
      piecesJointes: [],
      historique: [],
    };
    nouvelleObs.numeroSuivi = `EW-${nouvelleObs.id.slice(-6).toUpperCase()}`;
    nouvelleObs.historique = [{ date: nouvelleObs.dateCreation, utilisateur: agent.nom, action: "Création manuelle", nouvelleValeur: "Nouvelle" }];
    
    const list = getObservations();
    list.unshift(nouvelleObs);
    localStorage.setItem("eco_observations", JSON.stringify(list));
    
    // Ajouter notification
    const notifs = getNotifs();
    notifs.unshift({
      obsId: nouvelleObs.id,
      agentNom: nouvelleObs.agentNom,
      typeProbleme: nouvelleObs.typeProbleme,
      zone: nouvelleObs.zone,
      dateCreation: nouvelleObs.dateCreation,
      lu: false,
    });
    localStorage.setItem("eco_notifs", JSON.stringify(notifs.slice(0, 50)));
    
    setFormSucces(true);
    setTimeout(() => {
      setFormSucces(false);
      setFormType(null);
      setFormZone(null);
      setFormCommentaire("");
      setFormPhoto(null);
      setFormAgentNom("");
      charger();
    }, 2000);
  };

  // ── Export ───────────────────────────────────────────────────
  const exporterExcel = () => {
    const data = listeFiltree.map((obs) => ({
      Date: new Date(obs.dateCreation).toLocaleString("fr-TN"),
      Agent: obs.agentNom, Telephone: `+216 ${obs.agentTelephone}`,
      Type: LIBELLES_PROBLEMES[obs.typeProbleme], Zone: LIBELLES_ZONES[obs.zone],
      Commentaire: obs.commentaire, Photo: obs.photo ? "Oui" : "Non",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Observations");
    XLSX.writeFile(wb, `EcoWatch_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exporterCSV = () => {
    const data = listeFiltree.map((obs) => ({
      Date: new Date(obs.dateCreation).toLocaleString("fr-TN"),
      Agent: obs.agentNom, Telephone: `+216 ${obs.agentTelephone}`,
      Type: LIBELLES_PROBLEMES[obs.typeProbleme], Zone: LIBELLES_ZONES[obs.zone],
      Commentaire: obs.commentaire, Photo: obs.photo ? "Oui" : "Non",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `EcoWatch_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-TN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const fmtCourt = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffMin < 1440) return `Il y a ${Math.floor(diffMin / 60)}h`;
    return d.toLocaleDateString("fr-TN", { day: "2-digit", month: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Toast notification ─────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-bounce-once">
          <div className="bg-green-700 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3 max-w-sm mx-auto">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">
              {ICONE[toast.typeProbleme] ?? "⚠️"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm">Nouveau signalement !</p>
              <p className="text-green-200 text-xs truncate">
                {toast.agentNom} · {LIBELLES_PROBLEMES[toast.typeProbleme as TypeProbleme]} · {LIBELLES_ZONES[toast.zone as keyof typeof LIBELLES_ZONES]}
              </p>
            </div>
            <button onClick={() => setToast(null)} className="text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-green-800 text-white px-5 py-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-black text-xl leading-none">EcoWatch Admin</p>
            <p className="text-green-300 text-xs mt-0.5">
              {agent.nom} · {observations.length} observations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={ouvrirNotifs}
              className="relative bg-white/20 rounded-xl p-2.5 hover:bg-white/30 transition-colors"
            >
              {nonLues > 0
                ? <BellRing className="w-5 h-5 text-yellow-300" />
                : <Bell className="w-5 h-5" />
              }
              {nonLues > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {nonLues > 99 ? "99+" : nonLues}
                </span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sortir
            </button>
          </div>
        </div>
      </header>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-wrap">
          {([
            { id: "notifs" as Onglet, label: "Alertes", icon: Bell, badge: nonLues },
            { id: "graphiques" as Onglet, label: "Stats", icon: BarChart2, badge: 0 },
            { id: "liste" as Onglet, label: "Liste", icon: List, badge: 0 },
            { id: "ajouter" as Onglet, label: "Ajouter", icon: PlusCircle, badge: 0 },
            { id: "qr" as Onglet, label: "QR", icon: QrCode, badge: 0 },
          ] as const).map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => {
                setOnglet(id);
                if (id === "notifs") { marquerToutLu(); setNonLues(0); }
              }}
              className={`flex-1 relative flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-bold border-b-2 transition-colors ${
                onglet === id ? "border-green-600 text-green-700" : "border-transparent text-gray-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge && badge > 0 && (
                <span className="absolute top-1.5 right-2 bg-red-500 text-white text-xs font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-5">

        {/* ══ ONGLET ALERTES / NOTIFICATIONS ══════════════════════ */}
        {onglet === "notifs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
                <h2 className="font-black text-gray-800 text-base">
                  Signalements reçus
                </h2>
                <button onClick={handleMigration} className="text-xs text-blue-600 font-semibold">Migrer localStorage</button>

              {notifs.some((n) => !n.lu) && (
                <button
                  onClick={() => { marquerToutLu(); setNonLues(0); setNotifs(getNotifs()); }}
                  className="text-xs text-green-600 font-semibold flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Tout marquer lu
                </button>
              )}
            </div>

            {notifs.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
                <Bell className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 font-semibold">Aucun signalement reçu</p>
                <p className="text-gray-400 text-sm mt-1">
                  Les signalements des agents apparaîtront ici automatiquement
                </p>
              </div>
            ) : (
              notifs.map((notif, i) => (
                <div
                  key={i}
                  className={`rounded-2xl p-4 border transition-all ${
                    !notif.lu
                      ? "bg-green-50 border-green-200 shadow-sm"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icône */}
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${!notif.lu ? "bg-green-100" : "bg-gray-100"}`}>
                      {ICONE[notif.typeProbleme] ?? "⚠️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-black text-sm ${!notif.lu ? "text-green-800" : "text-gray-700"}`}>
                          {LIBELLES_PROBLEMES[notif.typeProbleme as TypeProbleme]}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!notif.lu && (
                            <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                          )}
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {fmtCourt(notif.dateCreation)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <User className="w-3 h-3 text-green-600" />
                          {notif.agentNom}
                        </span>
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-green-600" />
                          {LIBELLES_ZONES[notif.zone as keyof typeof LIBELLES_ZONES]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ ONGLET GRAPHIQUES ════════════════════════════════════ */}
        {onglet === "graphiques" && (
          <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total", val: kpis.total, color: "bg-green-100 text-green-800" },
                { label: "Aujourd'hui", val: kpis.aujourdhui, color: "bg-blue-100 text-blue-800" },
                { label: "Cette semaine", val: kpis.semaine, color: "bg-orange-100 text-orange-800" },
                { label: "Avec photo", val: kpis.avecPhoto, color: "bg-purple-100 text-purple-800" },
              ].map(({ label, val, color }) => (
                <div key={label} className={`rounded-2xl p-4 text-center ${color}`}>
                  <p className="text-3xl font-black">{val}</p>
                  <p className="text-xs font-semibold mt-1">{label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "En retard", val: kpisEtendus.enRetard, color: "bg-red-100 text-red-800" },
                { label: "Échéances proches", val: kpisEtendus.proches, color: "bg-yellow-100 text-yellow-800" },
                { label: "Taux clôture", val: `${kpisEtendus.tauxCloture}%`, color: "bg-emerald-100 text-emerald-800" },
                { label: "Délai prise en charge (j)", val: kpisEtendus.delaiPrise ?? "—", color: "bg-blue-100 text-blue-800" },
                { label: "Délai résolution (j)", val: kpisEtendus.delaiResol ?? "—", color: "bg-purple-100 text-purple-800" },
              ].map(({ label, val, color }) => (
                <div key={label} className={`rounded-2xl p-4 text-center ${color}`}>
                  <p className="text-3xl font-black">{val}</p>
                  <p className="text-xs font-semibold mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Barres */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-black text-gray-800 text-base mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-green-600" />
                Observations par jour (14 jours)
              </h3>
              {donneesParJour.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={donneesParJour} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [`${v} obs.`, "Total"]} labelStyle={{ fontWeight: "bold" }} />
                    <Bar dataKey="total" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Camembert */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-black text-gray-800 text-base mb-4 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-green-600" />
                Répartition par type
              </h3>
              {donneesCamembert.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Aucune donnée</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={donneesCamembert} cx="50%" cy="45%" outerRadius={85} dataKey="value" label={false} labelLine={false}>
                      {donneesCamembert.map((_, i) => (
                        <Cell key={i} fill={COULEURS[i % COULEURS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} obs.`]} />
                    <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ══ ONGLET LISTE ═════════════════════════════════════════ */}
        {onglet === "liste" && (
          <div className="space-y-4">
            {/* Filtres + Export */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-green-600" />
                <span className="font-bold text-sm text-gray-700">Filtres</span>
                {(filtreZone || filtreType) && (
                  <button onClick={() => { setFiltreZone(""); setFiltreType(""); }}
                    className="ml-auto text-xs text-red-500 flex items-center gap-1">
                    <X className="w-3 h-3" /> Effacer
                  </button>
                     )}
                   </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <select className="input-terrain text-sm" style={{ minHeight: 44 }} value={filtreZone} onChange={(e) => setFiltreZone(e.target.value)}>
                  <option value="">Toutes les zones</option>
                  {Object.entries(LIBELLES_ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="input-terrain text-sm" style={{ minHeight: 44 }} value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
                  <option value="">Tous les types</option>
                  {Object.entries(LIBELLES_PROBLEMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={exporterExcel} className="flex-1 btn-terrain bg-emerald-700 text-white rounded-xl text-sm" style={{ minHeight: 44 }}>
                  <Download className="w-4 h-4" /> Excel
                </button>
                <button onClick={exporterPDF} className="flex-1 btn-terrain bg-red-700 text-white rounded-xl text-sm" style={{ minHeight: 44 }}>
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 font-semibold px-1">{listeFiltree.length} observation(s)</p>

            {listeFiltree.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-semibold">Aucune observation</p>
              </div>
            ) : (
              <div className="space-y-3">
                {listeFiltree.map((obs) => (
                  <div key={obs.id} className="obs-card">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ICONE[obs.typeProbleme] ?? "⚠️"}</span>
                        <span className={`badge ${COULEUR_BADGE[obs.typeProbleme]}`}>
                          {LIBELLES_PROBLEMES[obs.typeProbleme]}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />{fmt(obs.dateCreation)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-green-600" />
                        <span className="font-semibold">{obs.agentNom}</span>
                        <span className="text-xs text-gray-400">+216 {obs.agentTelephone}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-green-600" />
                        {LIBELLES_ZONES[obs.zone]}
                      </span>
                    </div>
                    {obs.commentaire && (
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2 mb-2">{obs.commentaire}</p>
                    )}
                    {obs.photo && (
                      <button onClick={() => setPhotoPreview(obs.photo!)} className="block w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={obs.photo} alt="Photo" className="w-full max-h-36 object-cover rounded-xl border border-gray-200" />
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Agrandir
                        </p>
                      </button>
                    )}
                    <button
                      className="btn-terrain btn-secondary w-full text-sm mt-2"
                      style={{ minHeight: 40 }}
                      onClick={() => ouvrirTraitement(obs)}
                    >
                      Traiter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ ONGLET QR ════════════════════════════════════════════ */}
        {onglet === "qr" && <QRCodeCanvas />}

        {/* ══ ONGLET AJOUTER MANUEL ════════════════════════════════════ */}
        {onglet === "ajouter" && (
          <div className="space-y-5">
            <h2 className="font-black text-gray-800 text-lg">Ajouter un signalement manuel</h2>
            <p className="text-gray-500 text-sm">Enregistrement manuel par l&apos;administrateur</p>

            {/* Succès */}
            {formSucces && (
              <div className="bg-green-100 border border-green-300 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <p className="text-green-700 font-bold">Signalement ajouté avec succès !</p>
              </div>
            )}

            {/* Nom de l'agent/signaleur */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-bold text-gray-700 mb-2">Nom du signaleur *</label>
              <input
                className="input-terrain"
                placeholder="Ex: Ahmed - Cuisine"
                value={formAgentNom}
                onChange={(e) => setFormAgentNom(e.target.value)}
              />
            </div>

            {/* Type */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-bold text-gray-700 mb-2">Type de problème *</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(LIBELLES_PROBLEMES) as [TypeProbleme, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`choix-card ${formType === key ? "selected" : ""}`}
                    onClick={() => setFormType(key)}
                  >
                    <span className="text-xl mr-2">{ICONE[key]}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zone */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-bold text-gray-700 mb-2">Zone *</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(LIBELLES_ZONES) as [ZoneUsine, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`choix-card justify-center ${formZone === key ? "selected" : ""}`}
                    onClick={() => setFormZone(key)}
                  >
                    <MapPin className="w-4 h-4 mr-1" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Commentaire */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-sm font-bold text-gray-700 mb-2">Commentaire</label>
              <textarea
                className="input-terrain resize-none"
                rows={3}
                placeholder="Details du signalement..."
                value={formCommentaire}
                onChange={(e) => setFormCommentaire(e.target.value)}
              />
            </div>

            {/* Bouton */}
            <button
              className={`btn-terrain w-full text-lg ${formType && formZone && formAgentNom.trim() ? "btn-primary" : "bg-gray-300 text-gray-500"}`}
              style={{ minHeight: 60 }}
              disabled={!formType || !formZone || !formAgentNom.trim()}
              onClick={handleAjoutManuel}
            >
              <Send className="w-5 h-5" />
              Enregistrer le signalement
            </button>
          </div>
        )}
      </main>

      {/* Modal traitement */}
      {obsSelectionnee && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setObsSelectionnee(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-gray-800 mb-3">Traitement — {obsSelectionnee.numeroSuivi}</h3>
            <div className="space-y-3">
              <select className="input-terrain text-sm" value={traitStatut} onChange={(e) => setTraitStatut(e.target.value as StatutAnomalie)}>
                {Object.entries(LIBELLES_STATUTS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input-terrain text-sm" value={traitPriorite} onChange={(e) => setTraitPriorite(e.target.value as PrioriteAnomalie)}>
                {Object.entries(LIBELLES_PRIORITES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className="input-terrain" placeholder="Responsable" value={traitResponsable} onChange={(e) => setTraitResponsable(e.target.value)} />
              <input className="input-terrain" type="date" value={traitEcheance} onChange={(e) => setTraitEcheance(e.target.value)} />
              <textarea className="input-terrain resize-none" rows={2} placeholder="Analyse de cause" value={traitAnalyse} onChange={(e) => setTraitAnalyse(e.target.value)} />
              <textarea className="input-terrain resize-none" rows={2} placeholder="Mesures immédiates" value={traitMesures} onChange={(e) => setTraitMesures(e.target.value)} />
              <textarea className="input-terrain resize-none" rows={2} placeholder="Actions correctives" value={traitActions} onChange={(e) => setTraitActions(e.target.value)} />
              <textarea className="input-terrain resize-none" rows={2} placeholder="Vérification efficacité" value={traitVerification} onChange={(e) => setTraitVerification(e.target.value)} />
              <button className="btn-terrain btn-primary w-full" onClick={sauverTraitement} disabled={traitEnCours}>
                {traitEnCours ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {photoPreview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPhotoPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoPreview} alt="Photo" className="max-w-full max-h-full rounded-2xl" />
          <button className="absolute top-5 right-5 bg-white text-black rounded-full p-2 shadow-xl" onClick={() => setPhotoPreview(null)}>
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
