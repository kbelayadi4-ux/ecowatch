/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect } from "react";
import { signInWithPhone, signUpAgent, verifyOtp, onAuthChange } from "@/lib/auth";
import { Agent } from "@/lib/types";
import {
  Phone,
  LogIn,
  Leaf,
  UserPlus,
  HardHat,
  ShieldCheck,
  ChevronLeft,
  Loader2,
} from "lucide-react";

interface Props {
  onLogin: (agent: Agent) => void;
}

type Ecran =
  | "accueil"
  | "connexion_choix"
  | "connexion_form"
  | "inscription_choix"
  | "inscription_form"
  | "otp_sent";

export default function AuthPage({ onLogin }: Props) {
  const [ecran, setEcran] = useState<Ecran>("accueil");
  const [roleChoisi, setRoleChoisi] = useState<"agent" | "admin">("agent");
  const [telephone, setTelephone] = useState("");
  const [nom, setNom] = useState("");
  const [codeOtp, setCodeOtp] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  const reset = () => {
    setTelephone("");
    setNom("");
    setCodeOtp("");
    setErreur("");
    setChargement(false);
  };

  const normaliser = (tel: string) =>
    tel.replace(/\s/g, "").replace(/^216/, "");

  // Listen to auth changes (Supabase session)
  useEffect(() => {
    const unsub = onAuthChange((agent) => {
      if (agent) onLogin(agent);
    });
    return () => unsub();
  }, [onLogin]);

  // CONNEXION
  const handleConnexion = async () => {
    const tel = normaliser(telephone);
    if (tel.length < 8) {
      setErreur("Numero invalide (8 chiffres minimum)");
      return;
    }
    setChargement(true);
    setErreur("");
    const { error } = await signInWithPhone(tel);
    setChargement(false);
    if (error) {
      setErreur(error);
    } else {
      setEcran("otp_sent");
    }
  };

  // INSCRIPTION (always creates agent role, admin role assigned by admin via Supabase Dashboard)
  const handleInscription = async () => {
    const tel = normaliser(telephone);
    if (tel.length < 8) {
      setErreur("Numero invalide (8 chiffres minimum)");
      return;
    }
    if (nom.trim().length < 2) {
      setErreur("Entrez votre nom complet (minimum 2 caracteres)");
      return;
    }
    setChargement(true);
    setErreur("");
    const { error } = await signUpAgent(tel, nom.trim());
    setChargement(false);
    if (error) {
      setErreur(error);
    } else {
      setEcran("otp_sent");
    }
  };

  // VERIFICATION OTP
  const handleVerifyOtp = async () => {
    if (codeOtp.length !== 6) {
      setErreur("Code a 6 chiffres requis");
      return;
    }
    setChargement(true);
    setErreur("");
    const { error } = await verifyOtp(telephone, codeOtp);
    setChargement(false);
    if (error) {
      setErreur(error);
    }
    // onAuthChange will trigger onLogin
  };

  // RENDU
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 flex flex-col items-center justify-center px-5 py-10">

      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="bg-white rounded-full p-4 mb-3 shadow-xl">
          <Leaf className="w-12 h-12 text-green-700" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">EcoWatch</h1>
        <p className="text-green-200 text-sm mt-1 font-medium">
          Observations Environnementales
        </p>
      </div>

      {/* ACCUEIL */}
      {ecran === "accueil" && (
        <div className="w-full max-w-sm space-y-4">
          <button
            className="btn-terrain btn-primary w-full text-lg shadow-xl"
            style={{ minHeight: 72 }}
            onClick={() => { reset(); setEcran("connexion_choix"); }}
            disabled={chargement}
          >
            <LogIn className="w-6 h-6" />
            Se connecter
          </button>
          <button
            className="btn-terrain btn-secondary w-full text-lg bg-white shadow-xl"
            style={{ minHeight: 72 }}
            onClick={() => { reset(); setEcran("inscription_choix"); }}
            disabled={chargement}
          >
            <UserPlus className="w-6 h-6" />
            Creer un compte
          </button>
          <p className="text-green-300 text-xs text-center pt-2">
            Application gratuite - Usine Environnementale
          </p>
        </div>
      )}

      {/* CHOIX ROLE CONNEXION */}
      {ecran === "connexion_choix" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => setEcran("accueil")} />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-black text-gray-800 mb-1">Connexion</h2>
            <p className="text-gray-500 text-sm mb-6">
              Choisissez votre type de compte
            </p>
            <div className="grid grid-cols-2 gap-4 mb-2">
              <CarteRole
                actif={roleChoisi === "agent"}
                onClick={() => setRoleChoisi("agent")}
                icone={<HardHat className="w-8 h-8" />}
                titre="Agent"
                desc="Terrain / Operateur"
                couleur="green"
              />
              <CarteRole
                actif={roleChoisi === "admin"}
                onClick={() => setRoleChoisi("admin")}
                icone={<ShieldCheck className="w-8 h-8" />}
                titre="Admin"
                desc="Direction / Responsable"
                couleur="blue"
              />
            </div>
            <button
              className="btn-terrain btn-primary w-full mt-4"
              onClick={() => { setErreur(""); setEcran("connexion_form"); }}
              disabled={chargement}
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* FORMULAIRE CONNEXION */}
      {ecran === "connexion_form" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => { reset(); setEcran("connexion_choix"); }} />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <BadgeRole role={roleChoisi} />
            <h2 className="text-xl font-black text-gray-800 mb-1 mt-3">Connexion</h2>
            <p className="text-gray-500 text-sm mb-5">
              Entrez votre numero de telephone
            </p>

            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Numero de telephone
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
                placeholder="2X XXX XXX"
                value={telephone}
                onChange={(e) => { setTelephone(e.target.value); setErreur(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleConnexion()}
                autoFocus
                disabled={chargement}
              />
            </div>

            {erreur && <MessageErreur texte={erreur} />}

            <button className="btn-terrain btn-primary w-full" onClick={handleConnexion} disabled={chargement}>
              {chargement ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {chargement ? "Envoi..." : "Se connecter"}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Pas encore de compte ?{" "}
              <button
                className="text-green-600 font-bold underline"
                onClick={() => { reset(); setRoleChoisi(roleChoisi); setEcran("inscription_form"); }}
              >
                Creer un compte
              </button>
            </p>
          </div>
        </div>
      )}

      {/* CHOIX ROLE INSCRIPTION */}
      {ecran === "inscription_choix" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => setEcran("accueil")} />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-black text-gray-800 mb-1">Creer un compte</h2>
            <p className="text-gray-500 text-sm mb-6">
              Choisissez votre type de compte
            </p>
            <div className="grid grid-cols-2 gap-4 mb-2">
              <CarteRole
                actif={roleChoisi === "agent"}
                onClick={() => setRoleChoisi("agent")}
                icone={<HardHat className="w-8 h-8" />}
                titre="Agent"
                desc="Terrain / Operateur"
                couleur="green"
              />
              <CarteRole
                actif={roleChoisi === "admin"}
                onClick={() => setRoleChoisi("admin")}
                icone={<ShieldCheck className="w-8 h-8" />}
                titre="Admin"
                desc="Direction / Responsable"
                couleur="blue"
              />
            </div>
            <button
              className="btn-terrain btn-primary w-full mt-4"
              onClick={() => { setErreur(""); setEcran("inscription_form"); }}
              disabled={chargement}
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* FORMULAIRE INSCRIPTION */}
      {ecran === "inscription_form" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => { reset(); setEcran("inscription_choix"); }} />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <BadgeRole role={roleChoisi} />
            <h2 className="text-xl font-black text-gray-800 mb-1 mt-3">
              Creer un compte
            </h2>
            <p className="text-gray-500 text-sm mb-5">
              Remplissez vos informations
            </p>

            {/* Nom */}
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nom complet
            </label>
            <input
              className="input-terrain mb-4"
              type="text"
              placeholder="Ex: Ahmed Ben Ali"
              value={nom}
              onChange={(e) => { setNom(e.target.value); setErreur(""); }}
              autoFocus
              disabled={chargement}
            />

            {/* Telephone */}
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Numero de telephone
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
                onChange={(e) => { setTelephone(e.target.value); setErreur(""); }}
                disabled={chargement}
              />
            </div>

            {roleChoisi === "admin" && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-700">
                <p className="font-semibold mb-1">Compte administrateur</p>
                <p>Le role admin est attribue par l'equipe technique via Supabase Dashboard.</p>
              </div>
            )}

            {erreur && <MessageErreur texte={erreur} />}

            <button
              className="btn-terrain btn-primary w-full"
              onClick={handleInscription}
              disabled={chargement}
            >
              {chargement ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              {chargement ? "Envoi..." : "Creer mon compte"}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Deja un compte ?{" "}
              <button
                className="text-green-600 font-bold underline"
                onClick={() => { reset(); setEcran("connexion_form"); }}
              >
                Se connecter
              </button>
            </p>
          </div>
        </div>
      )}

      {/* OTP ENVOYE */}
      {ecran === "otp_sent" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => { reset(); setEcran(roleChoisi === "admin" ? "inscription_choix" : "connexion_choix"); }} />
          <div className="bg-white rounded-3xl shadow-2xl p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-black text-gray-800 mb-2">Code envoye</h2>
            <p className="text-gray-500 text-sm mb-6">
              Un code a 6 chiffres a ete envoye par SMS au <span className="font-semibold">+216 {telephone}</span>
            </p>

            <label className="block text-sm font-semibold text-gray-700 mb-2 text-left">Code de verification</label>
            <input
              className="input-terrain text-center text-2xl tracking-widest mb-4"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="... ... ... ... ... ..."
              value={codeOtp}
              onChange={(e) => { setCodeOtp(e.target.value.slice(0, 6)); setErreur(""); }}
              autoFocus
            />

            {erreur && <MessageErreur texte={erreur} />}

            <button className="btn-terrain btn-primary w-full" onClick={handleVerifyOtp} disabled={chargement || codeOtp.length !== 6}>
              {chargement ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {chargement ? "Verification..." : "Valider le code"}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Pas recu ?{" "}
              <button className="text-green-600 font-bold underline" onClick={() => { setEcran(roleChoisi === "admin" ? "inscription_form" : "connexion_form"); }}>
                Renvoyer
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Sous-composants

function BoutonRetour({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-green-200 hover:text-white font-semibold text-sm mb-4 transition-colors">
      <ChevronLeft className="w-5 h-5" />
      Retour
    </button>
  );
}

function BadgeRole({ role }: { role: "agent" | "admin" }) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
      role === "admin"
        ? "bg-blue-100 text-blue-700"
        : "bg-green-100 text-green-700"
    }`}>
      {role === "admin" ? (
        <ShieldCheck className="w-3.5 h-3.5" />
      ) : (
        <HardHat className="w-3.5 h-3.5" />
      )}
      {role === "admin" ? "Administrateur" : "Agent terrain"}
    </div>
  );
}

function CarteRole({
  actif,
  onClick,
  icone,
  titre,
  desc,
  couleur,
}: {
  actif: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  titre: string;
  desc: string;
  couleur: "green" | "blue";
}) {
  const base = "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 cursor-pointer transition-all text-center";
  const actifStyle =
    couleur === "green"
      ? "border-green-500 bg-green-50 text-green-700"
      : "border-blue-500 bg-blue-50 text-blue-700";
  const inactifStyle = "border-gray-200 bg-white text-gray-500 hover:border-gray-300";

  return (
    <button
      className={`${base} ${actif ? actifStyle : inactifStyle}`}
      style={{ minHeight: 110 }}
      onClick={onClick}
    >
      <div className={actif ? "" : "opacity-50"}>{icone}</div>
      <div>
        <p className="font-black text-base">{titre}</p>
        <p className="text-xs opacity-70 mt-0.5">{desc}</p>
      </div>
      {actif && (
        <div
          className={`w-3 h-3 rounded-full ${
            couleur === "green" ? "bg-green-500" : "bg-blue-500"
          }`}
        />
      )}
    </button>
  );
}

function MessageErreur({ texte }: { texte: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
      <p className="text-red-600 text-sm font-medium">{texte}</p>
    </div>
  );
}

// Import supabase for OTP verification
import { supabase } from "@/lib/supabase";
