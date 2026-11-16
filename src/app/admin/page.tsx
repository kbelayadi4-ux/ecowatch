"use client";

import { useEffect, useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Agent } from "@/lib/types";
import { getCurrentAgent, onAuthChange, signOut } from "@/lib/auth";
import AdminApp from "@/components/AdminApp";
import AdminLogin from "@/components/AdminLogin";

/**
 * Espace administration EcoWatch SCG.
 *
 * Accès strictement réservé aux comptes `role = 'admin'`. Les opérateurs
 * n'ont plus de compte et passent par le formulaire public `/signaler`.
 */
export default function AdminPage() {
  const [session, setSession] = useState<Agent | null | undefined>(undefined);

  useEffect(() => {
    let actif = true;

    const charger = async () => {
      const agent = await getCurrentAgent();
      if (actif) setSession(agent);
    };

    charger();

    const unsub = onAuthChange((agent) => {
      if (actif) setSession(agent);
    });

    return () => {
      actif = false;
      unsub();
    };
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AdminLogin onLogin={setSession} />;
  }

  if (session.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-xl font-black text-gray-800">Accès refusé</h1>
        <p className="text-sm text-gray-500 mt-2 text-center max-w-sm">
          Ce compte n&apos;est pas administrateur. Le formulaire de signalement
          public reste accessible sans compte.
        </p>
        <button
          className="btn-terrain btn-secondary mt-6"
          onClick={() => {
            signOut();
            setSession(null);
          }}
        >
          <LogOut className="w-5 h-5" /> Se déconnecter
        </button>
        <a href="/signaler" className="text-sm text-green-700 underline mt-4">
          Aller au formulaire public
        </a>
      </div>
    );
  }

  return (
    <AdminApp
      agent={session}
      onLogout={() => {
        signOut();
        setSession(null);
      }}
    />
  );
}