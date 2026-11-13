"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Bandeau d'état de connexion.
 *
 * L'application fonctionne en ligne : Supabase est la source de vérité.
 * Ce bandeau informe l'utilisateur qu'il est hors ligne, sans laisser croire
 * qu'un envoi pourra être synchronisé plus tard (aucune file d'attente locale
 * n'est implémentée dans cette version).
 */
export default function EtatConnexion() {
  const [enLigne, setEnLigne] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const maj = () => {
      const etat = navigator.onLine;
      setEnLigne(etat);
      setVisible(true);
      if (etat) {
        const timer = setTimeout(() => setVisible(false), 3000);
        return () => clearTimeout(timer);
      }
    };
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={`fixed top-0 left-0 right-0 z-[60] px-4 py-2 text-center text-sm font-semibold ${
        enLigne ? "bg-green-600 text-white" : "bg-amber-500 text-white"
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {enLigne ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        {enLigne
          ? "Connexion rétablie"
          : "Hors ligne — les signalements ne peuvent pas être envoyés pour le moment"}
      </span>
    </div>
  );
}