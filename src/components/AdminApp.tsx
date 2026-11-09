"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from "recharts";
import {
  LogOut, Download, QrCode, Calendar, MapPin, User,
  Leaf,
  Filter, X, Image as ImageIcon, BarChart2,
  PieChart as PieChartIcon, List, Bell, BellRing, CheckCheck,
  PlusCircle, Send, Camera, CheckCircle,
} from "lucide-react";
import { Agent, Observation, LIBELLES_PROBLEMES, LIBELLES_ZONES, TypeProbleme, ZoneUsine } from "@/lib/types";
import { clearSession } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { getObservations, getNotifs, getNotifsNonLues, marquerToutLu, marquerNotifLu } from "@/lib/data";
import type { Notif } from "@/lib/store";
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
  const [chargement, setChargement] = useState(false);

  // ── Rechargement des données ─────────────────────────────────
  const charger = useCallback(async () => {
    const obs = await getObservations();
    const ns = await getNotifs();
    const nl = await getNotifsNonLues();
    setObservations(obs);
    setNotifs(ns as any);
    setNonLues(nl);
  }, []);

  // Chargement initial + polling + realtime
  useEffect(() => {
    const init = setTimeout(() => { charger(); }, 0);
    const interval = setInterval(() => { charger(); }, 3000);
    
    // Realtime subscriptions
    const channel = supabase.channel("ecowatch-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "observations" }, () => charger())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifs" }, () => charger())
      .subscribe();
    
    return () => { clearTimeout(init); clearInterval(interval); supabase.removeChannel(channel); };
  }, [charger]);

  // ── Toast pour nouvelle observation ─────────────────────────
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleLogout = () => { clearSession(); onLogout(); };

  // ── Formatting ──────────────────────────────────────────────
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-TN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtCourt = (iso: string) => new Date(iso).toLocaleString("fr-TN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // ── Export Excel ────────────────────────────────────────────
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(observations.map(o => ({
      ID: o.id, Agent: o.agentNom, Téléphone: o.agentTelephone,
      Type: LIBELLES_PROBLEMES[o.typeProbleme], Zone: LIBELLES_ZONES[o.zone],
      Commentaire: o.commentaire, Date: fmtDate(o.dateCreation), Partage: o.partage ? "Oui" : "Non",
    })));
    XLSX.utils.book_append_sheet(wb, ws, "Signalements");
    XLSX.writeFile(wb, `EcoWatch_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Statistiques ────────────────────────────────────────────
  const stats = useMemo(() => {
    const parType: Record<TypeProbleme, number> = {} as any;
    const parZone: Record<ZoneUsine, number> = {} as any;
    observations.forEach(o => {
      parType[o.typeProbleme] = (parType[o.typeProbleme] || 0) + 1;
      parZone[o.zone] = (parZone[o.zone] || 0) + 1;
    });
    return { parType, parZone, total: observations.length };
  }, [observations]);

  // ── Ajout manuel ────────────────────────────────────────────
  const handleAjoutManuel = async () => {
    setChargement(true);
    if (!formType || !formZone || !formAgentNom.trim()) {
      setChargement(false);
      return;
    }
    // Use admin's actual agent_id for FK constraint
    const adminAgentId = agent.id;
    const nouvelleObs: Observation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
      agentId: adminAgentId,
      agentNom: formAgentNom.trim(),
      agentTelephone: "00000000",
      typeProbleme: formType,
      commentaire: formCommentaire.trim(),
      zone: formZone,
      photo: formPhoto || undefined,
      dateCreation: new Date().toISOString(),
      partage: false,
    };
    // Insert via data layer (will trigger notification via DB trigger)
    const { saveObservation } = await import("@/lib/data");
    await saveObservation(nouvelleObs);
    setFormSucces(true);
    setTimeout(() => {
      setFormSucces(false);
      setFormType(null); setFormZone(null); setFormCommentaire(""); setFormPhoto(null); setFormAgentNom("");
      setChargement(false);
      charger();
    }, 2000);
  };

  // ── RENDU ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-700 text-white px-5 py-4 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-1.5"><Leaf className="w-5 h-5" /></div>
          <div>
            <p className="font-black text-lg leading-none">EcoWatch Admin</p>
            <p className="text-green-200 text-xs">{agent.nom} • Administrateur</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/30 transition-colors">
          <LogOut className="w-4 h-4" /> Sortir
        </button>
      </header>

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-50 border border-green-200 rounded-xl p-4 shadow-xl flex items-center gap-3 max-w-sm animate-slide-in">
          <BellRing className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-green-800 text-sm">{LIBELLES_PROBLEMES[toast.typeProbleme as TypeProbleme]}</p>
            <p className="text-green-700 text-xs truncate">{toast.agentNom} • {LIBELLES_ZONES[toast.zone as ZoneUsine]}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-green-400 hover:text-green-600"><X className="w-5 h-5" /></button>
        </div>
      )}

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-5">

        {/* ══ ONGLET ALERTES / NOTIFICATIONS ══════════════════════ */}
        {onglet === "notifs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-black text-gray-800 text-base">Signalements reçus</h2>
              {notifs.some(n => !n.lu) && (
                <button onClick={async () => { await marquerToutLu(); setNonLues(0); setNotifs(await getNotifs() as any); }} className="text-xs text-green-600 font-semibold flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Tout marquer lu
                </button>
              )}
            </div>

            {notifs.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
                <Bell className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 font-semibold">Aucun signalement reçu</p>
                <p className="text-gray-400 text-sm mt-1">Les signalements des agents apparaîtront ici automatiquement</p>
              </div>
            ) : (
              notifs.map((notif, i) => (
                <div key={i} onClick={() => { marquerNotifLu(notif.obsId); setNotifs(notifs.map(n => n.obsId === notif.obsId ? {...n, lu: true} : n)); }} className={`rounded-2xl p-4 border transition-all cursor-pointer ${!notif.lu ? "bg-green-50 border-green-200 shadow-sm" : "bg-white border-gray-100"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${!notif.lu ? "bg-green-100" : "bg-gray-100"}`}>
                      {ICONE[notif.typeProbleme] ?? "⚠️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-black text-sm ${!notif.lu ? "text-green-800" : "text-gray-700"}`}>
                          {LIBELLES_PROBLEMES[notif.typeProbleme as TypeProbleme]}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!notif.lu && <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />}
                          <span className="text-xs text-gray-400 whitespace-nowrap">{fmtCourt(notif.dateCreation)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="text-xs text-gray-600 flex items-center gap-1"><User className="w-3 h-3 text-green-600" />{notif.agentNom}</span>
                        <span className="text-xs text-gray-600 flex items-center gap-1"><MapPin className="w-3 h-3 text-green-600" />{LIBELLES_ZONES[notif.zone as keyof typeof LIBELLES_ZONES]}</span>
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
          <div className="space-y-6">
            <h2 className="font-black text-gray-800 text-base">Statistiques</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Par type */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4">Par type de problème</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={Object.entries(stats.parType).map(([k,v]) => ({name: LIBELLES_PROBLEMES[k as TypeProbleme], value: v, fullName: k}))} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({name, percent}) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`} labelLine={false}>
                      {Object.entries(stats.parType).map((_, i) => <Cell key={i} fill={COULEURS[i % COULEURS.length]} />)}
                    </Pie>
                    {/* @ts-ignore */}<Tooltip formatter={(v) => [v ?? 0, "signalements"]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Par zone */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4">Par zone</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={Object.entries(stats.parZone).map(([k,v]) => ({zone: LIBELLES_ZONES[k as ZoneUsine], count: v as number}))} layout="vertical">
                    <XAxis type="number" dataKey="count" tick={{fontSize: 11}} />
                    <YAxis type="category" dataKey="zone" width={120} tick={{fontSize: 11}} />
                    {/* @ts-ignore */}<Tooltip formatter={(v) => [v ?? 0, "signalements"]} />
                    <Bar dataKey="count" fill="#16a34a" radius={[0,4,4,0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ══ ONGLET LISTE COMPLÈTE ══════════════════════════════ */}
        {onglet === "liste" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 mb-3">
              <select className="input-terrain" value={filtreZone} onChange={e => setFiltreZone(e.target.value)}><option value="">Toutes zones</option>{Object.entries(LIBELLES_ZONES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select className="input-terrain" value={filtreType} onChange={e => setFiltreType(e.target.value)}><option value="">Tous types</option>{Object.entries(LIBELLES_PROBLEMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            {observations.filter(o => (!filtreZone || o.zone === filtreZone) && (!filtreType || o.typeProbleme === filtreType)).map(obs => (
              <div key={obs.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap gap-3 items-start">
                  <span className={`badge ${COULEUR_BADGE[obs.typeProbleme]}`}>{LIBELLES_PROBLEMES[obs.typeProbleme]}</span>
                  <span className="text-sm text-gray-500">{LIBELLES_ZONES[obs.zone]}</span>
                  <span className="text-sm text-gray-500">{fmtDate(obs.dateCreation)}</span>
                  <span className="text-sm text-gray-500">{obs.agentNom}</span>
                </div>
                {obs.commentaire && <p className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{obs.commentaire}</p>}
                {obs.photo && <img src={obs.photo} alt="Photo" className="mt-2 max-h-40 rounded-xl" />}
              </div>
            ))}
          </div>
        )}

        {/* ══ ONGLET QR CODE ════════════════════════════════════ */}
        {onglet === "qr" && (
          <div className="text-center space-y-4">
            <h2 className="font-black text-gray-800 text-base">QR Code d'accès agents</h2>
            <p className="text-gray-500 text-sm">Scannez pour ouvrir l'application</p>
            <QRCodeCanvas />
            <p className="text-xs text-gray-400">URL: https://animated-kashata-2eeaea.netlify.app</p>
          </div>
        )}

        {/* ══ ONGLET AJOUT MANUEL ══════════════════════════════ */}
        {onglet === "ajouter" && (
          <div className="space-y-4 max-w-md mx-auto">
            <h2 className="font-black text-gray-800 text-base text-center">Ajout manuel</h2>
            {formSucces && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-green-700">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="font-semibold">Signalement ajouté</p>
              </div>
            )}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
              <select className="input-terrain" value={formType ?? ""} onChange={e => setFormType(e.target.value as TypeProbleme)}><option value="">Type *</option>{Object.entries(LIBELLES_PROBLEMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select className="input-terrain" value={formZone ?? ""} onChange={e => setFormZone(e.target.value as ZoneUsine)}><option value="">Zone *</option>{Object.entries(LIBELLES_ZONES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className="input-terrain" placeholder="Nom de l'agent *" value={formAgentNom} onChange={e => setFormAgentNom(e.target.value)} />
              <textarea className="input-terrain resize-none" rows={3} placeholder="Commentaire" value={formCommentaire} onChange={e => setFormCommentaire(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <button className="btn-terrain btn-secondary" onClick={() => { if (typeof window !== "undefined") { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setFormPhoto(r.result as string); r.readAsDataURL(f); } }; input.click(); } }}><Camera className="w-5 h-5 mx-auto" /> Photo</button>
                <button className="btn-terrain btn-secondary" onClick={() => setFormPhoto(null)} disabled={!formPhoto}><X className="w-5 h-5 mx-auto" /> Retirer</button>
              </div>
              {formPhoto && <img src={formPhoto} alt="Aperçu" className="max-h-40 rounded-xl mx-auto" />}
              <button className="btn-terrain btn-primary w-full" onClick={handleAjoutManuel} disabled={!formType || !formZone || !formAgentNom.trim() || chargement}>
                <Send className="w-5 h-5" /> Enregistrer
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Navigation onglets */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around">
        {[
          { id: "notifs", label: "Alertes", icon: nonLues > 0 ? <BellRing className="w-6 h-6" /> : <Bell className="w-6 h-6" />, badge: nonLues },
          { id: "graphiques", label: "Graphiques", icon: <BarChart2 className="w-6 h-6" /> },
          { id: "liste", label: "Liste", icon: <List className="w-6 h-6" /> },
          { id: "qr", label: "QR Code", icon: <QrCode className="w-6 h-6" /> },
          { id: "ajouter", label: "Ajouter", icon: <PlusCircle className="w-6 h-6" /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setOnglet(tab.id as Onglet)} className={`flex flex-col items-center gap-1 text-xs transition-colors ${onglet === tab.id ? "text-green-600" : "text-gray-400 hover:text-green-600"}`}>
            <div className="relative">{tab.icon}{tab.badge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{tab.badge}</span>}</div>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
