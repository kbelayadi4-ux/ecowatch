"use client";

import { useState, useEffect } from "react";
import {
  getAgentByPhone,
  saveAgent,
  saveSession,
  generateId,
} from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { Agent } from "@/lib/types";
import {
  Phone,
  LogIn,
  Leaf,
  UserPlus,
  HardHat,
  ShieldCheck,
  ChevronLeft,
  Eye,
  EyeOff,
} from "lucide-react";

interface Props {
  onLogin: (agent: Agent) => void;
}

type Ecran =
  | "accueil"
  | "connexion_choix"   // choisir agent ou admin pour se connecter
  | "connexion_form"    // formulaire connexion
  | "inscription_choix" // choisir agent ou admin pour s'inscrire
  | "inscription_form"; // formulaire inscription

export default function AuthPage({ onLogin }: Props) {
  const [ecran, setEcran] = useState<Ecran>("accueil");
  // Restauration de session Supabase si disponible
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const { data: profile } = await client
          .from("profiles")
          .select("nom, role, telephone")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (profile) {
          const agent: Agent = {
            id: data.session.user.id,
            telephone: profile.telephone || "",
            nom: profile.nom || "",
            role: profile.role === "admin" ? "admin" : "agent",
          };
          saveSession(agent);
          onLogin(agent);
        }
      }
    });
  }, [onLogin]);

  const [roleChoisi, setRoleChoisi] = useState<"agent" | "admin">("agent");
  const [telephone, setTelephone] = useState("");
  const [nom, setNom] = useState("");
  const [codeAdmin, setCodeAdmin] = useState("");
  const [voirCode, setVoirCode] = useState(false);
  const [erreur, setErreur] = useState("");

  // Code d'accès admin (modifiable ici)
  const CODE_ADMIN = process.env.NEXT_PUBLIC_ADMIN_CODE || "";

  const reset = () => {
    setTelephone("");
    setNom("");
    setCodeAdmin("");
    setErreur("");
    setVoirCode(false);
  };

  const normaliser = (tel: string) =>
    tel.replace(/\s/g, "").replace(/^216/, "");

  // ── CONNEXION ─────────────────────────────────────────────
  const handleConnexion = () => {
    const tel = normaliser(telephone);
    if (tel.length < 8) {
      setErreur("Numéro invalide (8 chiffres minimum)");
      return;
    }
    const agent = getAgentByPhone(tel);
    if (!agent) {
      setErreur("Compte introuvable. Vérifiez votre numéro ou créez un compte.");
      return;
    }
    if (agent.role !== roleChoisi) {
      setErreur(
        roleChoisi === "admin"
          ? "Ce numéro n'est pas un compte administrateur."
          : "Ce numéro est enregistré en tant qu'administrateur."
      );
      return;
    }
    saveSession(agent);
    onLogin(agent);
  };

  // ── INSCRIPTION ───────────────────────────────────────────
  const handleInscription = () => {
    const tel = normaliser(telephone);
    if (tel.length < 8) {
      setErreur("Numéro invalide (8 chiffres minimum)");
      return;
    }
    if (nom.trim().length < 2) {
      setErreur("Entrez votre nom complet (minimum 2 caractères)");
      return;
    }
    if (roleChoisi === "admin" && codeAdmin !== CODE_ADMIN) {
      setErreur("Code d'accès administrateur incorrect.");
      return;
    }
    const existant = getAgentByPhone(tel);
    if (existant) {
      setErreur("Un compte existe déjà avec ce numéro. Connectez-vous.");
      return;
    }
    const agent: Agent = {
      id: generateId(),
      telephone: tel,
      nom: nom.trim(),
      role: roleChoisi,
    };
    saveAgent(agent);
    saveSession(agent);
    onLogin(agent);
  };

  // ══════════════════════════════════════════════════════════
  // RENDU
  // ══════════════════════════════════════════════════════════
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

      {/* ── ACCUEIL ──────────────────────────────────────── */}
      {ecran === "accueil" && (
        <div className="w-full max-w-sm space-y-4">
          <button
            className="btn-terrain btn-primary w-full text-lg shadow-xl"
            style={{ minHeight: 72 }}
            onClick={() => { reset(); setEcran("connexion_choix"); }}
          >
            <LogIn className="w-6 h-6" />
            Se connecter
          </button>
          <button
            className="btn-terrain btn-secondary w-full text-lg bg-white shadow-xl"
            style={{ minHeight: 72 }}
            onClick={() => { reset(); setEcran("inscription_choix"); }}
          >
            <UserPlus className="w-6 h-6" />
            Créer un compte
          </button>
          <p className="text-green-300 text-xs text-center pt-2">
            Application gratuite – Usine Environnementale
          </p>
        </div>
      )}

      {/* ── CHOIX RÔLE CONNEXION ─────────────────────────── */}
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
                desc="Terrain / Opérateur"
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
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* ── FORMULAIRE CONNEXION ──────────────────────────── */}
      {ecran === "connexion_form" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => { reset(); setEcran("connexion_choix"); }} />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <BadgeRole role={roleChoisi} />
            <h2 className="text-xl font-black text-gray-800 mb-1 mt-3">Connexion</h2>
            <p className="text-gray-500 text-sm mb-5">
              Entrez votre numéro de téléphone
            </p>

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
                placeholder="2X XXX XXX"
                value={telephone}
                onChange={(e) => { setTelephone(e.target.value); setErreur(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleConnexion()}
                autoFocus
              />
            </div>

            {erreur && <MessageErreur texte={erreur} />}

            <button className="btn-terrain btn-primary w-full" onClick={handleConnexion}>
              <LogIn className="w-5 h-5" />
              Se connecter
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Pas encore de compte ?{" "}
              <button
                className="text-green-600 font-bold underline"
                onClick={() => { reset(); setRoleChoisi(roleChoisi); setEcran("inscription_form"); }}
              >
                Créer un compte
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ── CHOIX RÔLE INSCRIPTION ───────────────────────── */}
      {ecran === "inscription_choix" && (
        <div className="w-full max-w-sm">
          <BoutonRetour onClick={() => setEcran("accueil")} />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-black text-gray-800 mb-1">Créer un compte</h2>
            <p className="text-gray-500 text-sm mb-6">
              Choisissez votre type de compte
            </p>
            <div className="grid grid-cols-2 gap-4 mb-2">
              <CarteRole
                actif={roleChoisi === "agent"}
                onClick={() => setRoleChoisi("agent")}
                icone={<HardHat className="w-8 h-8" />}
                titre="Agent"
                desc="Terrain / Opérateur"
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
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* ── FORMULAIRE INSCRIPTION ────────────────────────── */}
      {ecran === "inscription_form" && (
        <div className="w-full max-w-sm">
          <BoutonRetour
            onClick={() => { reset(); setEcran("inscription_choix"); }}
          />
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <BadgeRole role={roleChoisi} />
            <h2 className="text-xl font-black text-gray-800 mb-1 mt-3">
              Créer un compte
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
            />

            {/* Téléphone */}
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
                onChange={(e) => { setTelephone(e.target.value); setErreur(""); }}
              />
            </div>

            {/* Code admin */}
            {roleChoisi === "admin" && (
              <>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Code d&apos;accès administrateur
                </label>
                <div className="relative mb-4">
                  <input
                    className="input-terrain pr-12"
                    type={voirCode ? "text" : "password"}
                    placeholder="Code secret"
                    value={codeAdmin}
                    onChange={(e) => { setCodeAdmin(e.target.value); setErreur(""); }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    onClick={() => setVoirCode(!voirCode)}
                  >
                    {voirCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-4 -mt-2">
                  Demandez ce code à votre responsable informatique.
                </p>
              </>
            )}

            {erreur && <MessageErreur texte={erreur} />}

            <button
              className="btn-terrain btn-primary w-full"
              onClick={handleInscription}
            >
              <UserPlus className="w-5 h-5" />
              Créer mon compte
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Déjà un compte ?{" "}
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
    </div>
  );
}

// ── Sous-composants ──────────────────────────────────────────

function BoutonRetour({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-green-200 hover:text-white font-semibold text-sm mb-4 transition-colors"
    >
      <ChevronLeft className="w-5 h-5" />
      Retour
    </button>
  );
}

function BadgeRole({ role }: { role: "agent" | "admin" }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
        role === "admin"
          ? "bg-blue-100 text-blue-700"
          : "bg-green-100 text-green-700"
      }`}
    >
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
