"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Download,
  QrCode,
  Calendar,
  MapPin,
  User,
  Filter,
  X,
  Image as ImageIcon,
  BarChart2,
  PieChart as PieChartIcon,
  List,
} from "lucide-react";
import { Agent, Observation, LIBELLES_PROBLEMES, LIBELLES_ZONES, TypeProbleme } from "@/lib/types";
import { getObservations, clearSession } from "@/lib/store";
import QRCodeCanvas from "./QRCodeCanvas";
import * as XLSX from "xlsx";

interface Props {
  agent: Agent;
  onLogout: () => void;
}

const COULEURS_CAMEMBERT = [
  "#16a34a",
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#eab308",
  "#ef4444",
  "#6b7280",
  "#14b8a6",
  "#ec4899",
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

type Onglet = "graphiques" | "liste" | "qr";

export default function AdminApp({ agent, onLogout }: Props) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [onglet, setOnglet] = useState<Onglet>("graphiques");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [filtreZone, setFiltreZone] = useState("");
  const [filtreType, setFiltreType] = useState("");

  const charger = useCallback(() => {
    const data = getObservations();
    setObservations(data);
  }, []);

  useEffect(() => {
    // Initial load deferred to avoid set-state-in-effect lint rule
    const init = setTimeout(() => charger(), 0);
    const interval = setInterval(() => charger(), 5000);
    return () => {
      clearTimeout(init);
      clearInterval(interval);
    };
  }, [charger]);

  const handleLogout = () => {
    clearSession();
    onLogout();
  };

  // ── Données graphique barres (par jour) ──────────────────────
  const donneesParJour = (() => {
    const map: Record<string, number> = {};
    observations.forEach((obs) => {
      const d = new Date(obs.dateCreation).toLocaleDateString("fr-TN", {
        day: "2-digit",
        month: "2-digit",
      });
      map[d] = (map[d] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, total]) => ({ date, total }));
  })();

  // ── Données camembert (par type) ─────────────────────────────
  const donneesCamembert = (() => {
    const map: Record<string, number> = {};
    observations.forEach((obs) => {
      const label = LIBELLES_PROBLEMES[obs.typeProbleme];
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  })();

  // ── Filtrage liste ────────────────────────────────────────────
  const listeFiltree = observations.filter((obs) => {
    if (filtreZone && obs.zone !== filtreZone) return false;
    if (filtreType && obs.typeProbleme !== filtreType) return false;
    return true;
  });

  // ── Export Excel / CSV ────────────────────────────────────────
  const exporterExcel = () => {
    const data = listeFiltree.map((obs) => ({
      Date: new Date(obs.dateCreation).toLocaleString("fr-TN"),
      Agent: obs.agentNom,
      Telephone: `+216 ${obs.agentTelephone}`,
      Type: LIBELLES_PROBLEMES[obs.typeProbleme],
      Zone: LIBELLES_ZONES[obs.zone],
      Commentaire: obs.commentaire,
      Photo: obs.photo ? "Oui" : "Non",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Observations");
    XLSX.writeFile(wb, `EcoObs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exporterCSV = () => {
    const data = listeFiltree.map((obs) => ({
      Date: new Date(obs.dateCreation).toLocaleString("fr-TN"),
      Agent: obs.agentNom,
      Telephone: `+216 ${obs.agentTelephone}`,
      Type: LIBELLES_PROBLEMES[obs.typeProbleme],
      Zone: LIBELLES_ZONES[obs.zone],
      Commentaire: obs.commentaire,
      Photo: obs.photo ? "Oui" : "Non",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EcoObs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("fr-TN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const kpis = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return {
      total: observations.length,
      aujourdhui: observations.filter(
        (o) => new Date(o.dateCreation).toDateString() === todayStr
      ).length,
      semaine: observations.filter(
        (o) =>
          now.getTime() - new Date(o.dateCreation).getTime() <= weekMs
      ).length,
      avecPhoto: observations.filter((o) => o.photo).length,
    };
  }, [observations]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header admin */}
      <header className="bg-green-800 text-white px-5 py-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-black text-xl leading-none">EcoObs Admin</p>
            <p className="text-green-300 text-xs mt-0.5">
              Direction – {agent.nom} | {observations.length} observations totales
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sortir
          </button>
        </div>
      </header>

      {/* Navigation onglets */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex">
          {[
            { id: "graphiques" as Onglet, label: "Graphiques", icon: BarChart2 },
            { id: "liste" as Onglet, label: "Observations", icon: List },
            { id: "qr" as Onglet, label: "QR Code", icon: QrCode },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold border-b-3 transition-colors ${
                onglet === id
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* ── ONGLET GRAPHIQUES ─────────────────────────────── */}
        {onglet === "graphiques" && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total", val: kpis.total, color: "bg-green-100 text-green-800" },
                { label: "Aujourd'hui", val: kpis.aujourdhui, color: "bg-blue-100 text-blue-800" },
                { label: "Cette semaine", val: kpis.semaine, color: "bg-orange-100 text-orange-800" },
                { label: "Avec photo", val: kpis.avecPhoto, color: "bg-purple-100 text-purple-800" },
              ].map(({ label, val, color }) => (
                <div
                  key={label}
                  className={`rounded-2xl p-4 text-center ${color}`}
                >
                  <p className="text-3xl font-black">{val}</p>
                  <p className="text-xs font-semibold mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Graphique barres */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-black text-gray-800 text-base mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-green-600" />
                Observations par jour (14 derniers jours)
              </h3>
              {donneesParJour.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  Aucune donnée disponible
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={donneesParJour} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [`${value} obs.`, "Total"]}
                      labelStyle={{ fontWeight: "bold" }}
                    />
                    <Bar dataKey="total" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Camembert */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="font-black text-gray-800 text-base mb-4 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-green-600" />
                Répartition par type de problème
              </h3>
              {donneesCamembert.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  Aucune donnée disponible
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={donneesCamembert}
                      cx="50%"
                      cy="45%"
                      outerRadius={90}
                      dataKey="value"
                      label={false}
                      labelLine={false}
                    >
                      {donneesCamembert.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COULEURS_CAMEMBERT[index % COULEURS_CAMEMBERT.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} obs.`]} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ fontSize: 11 }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ── ONGLET LISTE ──────────────────────────────────── */}
        {onglet === "liste" && (
          <div className="space-y-4">
            {/* Filtres + Export */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-green-600" />
                <span className="font-bold text-sm text-gray-700">Filtres</span>
                {(filtreZone || filtreType) && (
                  <button
                    onClick={() => {
                      setFiltreZone("");
                      setFiltreType("");
                    }}
                    className="ml-auto text-xs text-red-500 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Effacer
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <select
                  className="input-terrain text-sm"
                  style={{ minHeight: 44 }}
                  value={filtreZone}
                  onChange={(e) => setFiltreZone(e.target.value)}
                >
                  <option value="">Toutes les zones</option>
                  {Object.entries(LIBELLES_ZONES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select
                  className="input-terrain text-sm"
                  style={{ minHeight: 44 }}
                  value={filtreType}
                  onChange={(e) => setFiltreType(e.target.value)}
                >
                  <option value="">Tous les types</option>
                  {Object.entries(LIBELLES_PROBLEMES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exporterExcel}
                  className="flex-1 btn-terrain bg-emerald-700 text-white rounded-xl text-sm"
                  style={{ minHeight: 44 }}
                >
                  <Download className="w-4 h-4" />
                  Excel
                </button>
                <button
                  onClick={exporterCSV}
                  className="flex-1 btn-terrain bg-blue-700 text-white rounded-xl text-sm"
                  style={{ minHeight: 44 }}
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 font-semibold px-1">
              {listeFiltree.length} observation(s) affichée(s)
            </p>

            {listeFiltree.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-semibold">Aucune observation trouvée</p>
              </div>
            ) : (
              <div className="space-y-3">
                {listeFiltree.map((obs) => (
                  <div key={obs.id} className="obs-card">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`badge ${COULEUR_BADGE[obs.typeProbleme]}`}>
                        {LIBELLES_PROBLEMES[obs.typeProbleme]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(obs.dateCreation)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-green-600" />
                        <span className="font-semibold">{obs.agentNom}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">
                          +216 {obs.agentTelephone}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-green-600" />
                        {LIBELLES_ZONES[obs.zone]}
                      </span>
                    </div>

                    {obs.commentaire && (
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2 mb-2">
                        {obs.commentaire}
                      </p>
                    )}

                    {obs.photo && (
                      <button
                        onClick={() => setPhotoPreview(obs.photo!)}
                        className="block w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={obs.photo}
                          alt="Photo"
                          className="w-full max-h-36 object-cover rounded-xl border border-gray-200"
                        />
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Cliquez pour agrandir
                        </p>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ONGLET QR CODE ────────────────────────────────── */}
        {onglet === "qr" && <QRCodeCanvas />}
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
