"use client";

import { useState } from "react";
import {
  getAgentByPhone,
  saveAgent,
  saveSession,
  generateId,
} from "@/lib/store";
import { Agent, ADMIN_PHONES } from "@/lib/types";
import { Phone, LogIn, Leaf } from "lucide-react";

interface Props {
  onLogin: (agent: Agent) => void;
}

export default function AuthPage({ onLogin }: Props) {
  const [telephone, setTelephone] = useState("");
  const [nom, setNom] = useState("");
  const [etape, setEtape] = useState<"telephone" | "nom">("telephone");
  const [erreur, setErreur] = useState("");

  const normaliser = (tel: string) => tel.replace(/\s/g, "").replace(/^216/, "");

  const handleTelephone = () => {
    const tel = normaliser(telephone);
    if (tel.length < 8) {
      setErreur("Numéro invalide (8 chiffres minimum)");
      return;
    }
    const agent = getAgentByPhone(tel);
    if (agent) {
      saveSession(agent);
      onLogin(agent);
      return;
    }
    // Nouvel utilisateur
    setErreur("");
    setEtape("nom");
  };

  const handleNom = () => {
    if (nom.trim().length < 2) {
      setErreur("Entrez votre nom complet");
      return;
    }
    const tel = normaliser(telephone);
    const role = ADMIN_PHONES.includes(tel) ? "admin" : "agent";
    const agent: Agent = {
      id: generateId(),
      telephone: tel,
      nom: nom.trim(),
      role,
    };
    saveAgent(agent);
    saveSession(agent);
    onLogin(agent);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="bg-white rounded-full p-4 mb-4 shadow-lg">
          <Leaf className="w-12 h-12 text-green-700" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">EcoWatch</h1>
        <p className="text-green-200 text-sm mt-1 font-medium">
          Observations Environnementales
        </p>
      </div>

      {/* Carte */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
        {etape === "telephone" ? (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Connexion</h2>
            <p className="text-gray-500 text-sm mb-6">
              Entrez votre numéro de téléphone
            </p>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Numéro de téléphone
            </label>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600 whitespace-nowrap">
                <Phone className="w-4 h-4" />
                <span>+216</span>
              </div>
              <input
                className="input-terrain flex-1"
                type="tel"
                inputMode="numeric"
                placeholder="2X XXX XXX"
                value={telephone}
                onChange={(e) => {
                  setTelephone(e.target.value);
                  setErreur("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleTelephone()}
                autoFocus
              />
            </div>
            {erreur && (
              <p className="text-red-600 text-sm mb-3 font-medium">{erreur}</p>
            )}
            <button
              className="btn-terrain btn-primary w-full"
              onClick={handleTelephone}
            >
              <LogIn className="w-5 h-5" />
              Continuer
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Votre nom</h2>
            <p className="text-gray-500 text-sm mb-6">
              Première connexion – entrez votre nom
            </p>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nom complet
            </label>
            <input
              className="input-terrain mb-4"
              type="text"
              placeholder="Ex: Ahmed Ben Ali"
              value={nom}
              onChange={(e) => {
                setNom(e.target.value);
                setErreur("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleNom()}
              autoFocus
            />
            {erreur && (
              <p className="text-red-600 text-sm mb-3 font-medium">{erreur}</p>
            )}
            <button
              className="btn-terrain btn-primary w-full"
              onClick={handleNom}
            >
              <LogIn className="w-5 h-5" />
              Accéder à l&apos;application
            </button>
            <button
              className="btn-terrain btn-secondary w-full mt-3"
              onClick={() => {
                setEtape("telephone");
                setErreur("");
              }}
            >
              Retour
            </button>
          </>
        )}
      </div>

      <p className="text-green-300 text-xs mt-8 text-center">
        Application gratuite – Usine Environnementale
      </p>
    </div>
  );
}
