"use client";

import { useState, useEffect } from "react";
import {
  PlusCircle,
  ClipboardList,
  LogOut,
  Leaf,
  ChevronLeft,
} from "lucide-react";
import { Agent } from "@/lib/types";
import { clearSession } from "@/lib/store";
import NouvelleObservation from "./NouvelleObservation";
import MesSignalements from "./MesSignalements";

interface Props {
  agent: Agent;
  onLogout: () => void;
}

type Vue = "accueil" | "nouvelle" | "signalements";

export default function AgentApp({ agent, onLogout }: Props) {
  const [vue, setVue] = useState<Vue>("accueil");

  const handleLogout = () => {
    clearSession();
    onLogout();
  };

  if (vue === "nouvelle") {
    return (
      <NouvelleObservation
        agent={agent}
        onRetour={() => setVue("accueil")}
        onSaved={() => setVue("signalements")}
      />
    );
  }

  if (vue === "signalements") {
    return (
      <MesSignalements
        agent={agent}
        onRetour={() => setVue("accueil")}
        onNouvelle={() => setVue("nouvelle")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-green-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-700 text-white px-5 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-1.5">
            <Leaf className="w-5 h-5" />
          </div>
          <div>
            <p className="font-black text-lg leading-none">EcoObs</p>
            <p className="text-green-200 text-xs">{agent.nom}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sortir
        </button>
      </header>

      {/* Corps */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">
        {/* Salutation */}
        <div className="text-center mb-2">
          <p className="text-2xl font-black text-green-800">Bonjour,</p>
          <p className="text-xl font-bold text-green-700">{agent.nom}</p>
          <p className="text-gray-500 text-sm mt-1">
            Signalez un problème sur le terrain
          </p>
        </div>

        {/* Bouton principal */}
        <button
          className="btn-terrain btn-primary w-full max-w-xs shadow-xl text-xl py-8 rounded-2xl flex-col gap-3"
          style={{ minHeight: 140 }}
          onClick={() => setVue("nouvelle")}
        >
          <PlusCircle className="w-12 h-12" strokeWidth={2} />
          <span>Nouvelle Observation</span>
        </button>

        {/* Bouton signalements */}
        <button
          className="btn-terrain btn-secondary w-full max-w-xs"
          onClick={() => setVue("signalements")}
        >
          <ClipboardList className="w-6 h-6" />
          Mes Signalements
        </button>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 pb-6">
        Application gratuite – EcoObs v1.0
      </footer>
    </div>
  );
}
