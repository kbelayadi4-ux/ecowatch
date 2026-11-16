"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Leaf,
  Loader2,
  LogIn,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { signInWithPhone, verifyOtp } from "@/lib/auth";
import { Agent } from "@/lib/types";

interface Props {
  onLogin: (agent: Agent) => void;
}

/**
 * Connexion administrateur uniquement (téléphone + code SMS).
 *
 * Les opérateurs n'ont plus de compte : ils passent par le formulaire
 * public `/signaler`. Cette page est réservée à l'administration SCG et
 * reste protégée par Supabase Auth + RLS.
 */
export default function AdminLogin({ onLogin }: Props) {
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [etape, setEtape] = useState<"telephone" | "code">("telephone");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  const normaliser = (tel: string) =>
    tel.replace(/\s/g, "").replace(/^\+?216/, "").replace(/^0/, "");

  const envoyerCode = async () => {
    const tel = normaliser(telephone);
    if (tel.length < 8) {
      setErreur("Numéro invalide (8 chiffres minimum).");
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      const { error } = await signInWithPhone(tel);
      if (error) {
        setErreur(error);
        return;
      }
      setEtape("code");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi du code impossible.");
    } finally {
      setChargement(false);
    }
  };

  const validerCode = async () => {
    const tel = normaliser(telephone);
    if (code.trim().length < 6) {
      setErreur("Code à 6 chiffres requis.");
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      const { error } = await verifyOtp(tel, code.trim());
      if (error) {
        setErreur(error);
        return;
      }
      // `onAuthChange` (page /admin) déclenchera onLogin.
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Vérification impossible.");
    } finally {
      setChargement(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 flex flex-col items-center justify-center px-5 py-10">
      <div className="flex flex-col items-center mb-8">
        <div className="bg-white rounded-full p-4 mb-3 shadow-xl">
          <Leaf className="w-12 h-12 text-green-700" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">EcoWatch</h1>
        <p className="text-green-200 text-sm mt-1 font-medium">Administration SCG</p>
      </div>

      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
              Accès réservé
            </span>
          </div>

          <h2 className="text-xl font-black text-gray-800 mb-1">
            {etape === "telephone" ? "Connexion administrateur" : "Code de vérification"}
          </h2>
          <p className="text-gray-500 text-sm mb-5">
            {etape === "telephone"
              ? "Entrez le numéro de téléphone de votre compte administrateur."
              : `Un code à 6 chiffres a été envoyé au +216 ${normaliser(telephone)}.`}
          </p>

          {etape === "telephone" ? (
            <>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Numéro de téléphone
              </label>
              <div className="flex items-center gap-2 mb-5">
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600 whitespace-nowrap">
                  <Phone className="w-4 h-4" />
                  <span>+216</span>
                </div>
                <input
                  className="input-terrain flex-1"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="2X XXX XXX"
                  value={telephone}
                  onChange={(e) => {
                    setTelephone(e.target.value);
                    setErreur("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && envoyerCode()}
                  disabled={chargement}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Code reçu par SMS
              </label>
              <input
                className="input-terrain w-full text-center text-2xl font-black tracking-[0.5em]"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="------"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setErreur("");
                }}
                onKeyDown={(e) => e.key === "Enter" && validerCode()}
                disabled={chargement}
              />
              <button
                className="text-xs text-green-700 underline mt-3"
                onClick={() => {
                  setEtape("telephone");
                  setCode("");
                  setErreur("");
                }}
                disabled={chargement}
              >
                Changer de numéro
              </button>
            </>
          )}

          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{erreur}</p>
            </div>
          )}

          <button
            className="btn-terrain btn-primary w-full mt-5"
            style={{ minHeight: 56 }}
            disabled={chargement}
            onClick={etape === "telephone" ? envoyerCode : validerCode}
          >
            {chargement ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            {etape === "telephone" ? "Recevoir le code" : "Valider"}
          </button>
        </div>

        <a
          href="/signaler"
          className="mt-6 flex items-center justify-center gap-2 text-green-100 text-sm hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Formulaire de signalement public
        </a>
        <p className="text-green-300 text-xs text-center mt-3">
          Les opérateurs n&apos;ont plus besoin de compte.
        </p>
      </div>
    </div>
  );
}