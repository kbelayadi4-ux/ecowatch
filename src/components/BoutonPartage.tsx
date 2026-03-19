"use client";

import { useState } from "react";
import { Share2, Copy, Check, MessageCircle, Mail, X } from "lucide-react";

interface Props {
  texte: string;
  sujetEmail: string;
  /** taille compacte (dans une carte) ou plein (page succès) */
  compact?: boolean;
}

export default function BoutonPartage({ texte, sujetEmail, compact = false }: Props) {
  const [copie, setCopie] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  // ── API Web Share (feuille système iOS/Android) ──────────
  const peutPartagerNativement =
    typeof navigator !== "undefined" && !!navigator.share;

  const partagerNatif = async () => {
    try {
      await navigator.share({ text: texte, title: sujetEmail });
    } catch {
      // annulé par l'utilisateur – rien à faire
    }
  };

  // ── WhatsApp deep link ───────────────────────────────────
  // whatsapp:// ouvre l'app native sur Android & iOS
  // wa.me est le fallback web si WhatsApp n'est pas installé
  const partagerWhatsApp = () => {
    const encoded = encodeURIComponent(texte);
    // On tente d'abord le deep link natif via un <a> invisible
    const a = document.createElement("a");
    a.href = `whatsapp://send?text=${encoded}`;
    a.rel = "noopener noreferrer";

    // Si le lien ne s'ouvre pas après 1.5s → fallback web
    let opened = false;
    const fallback = setTimeout(() => {
      if (!opened) {
        window.open(`https://wa.me/?text=${encoded}`, "_blank");
      }
    }, 1500);

    window.addEventListener(
      "blur",
      () => {
        opened = true;
        clearTimeout(fallback);
      },
      { once: true }
    );

    a.click();
    setOuvert(false);
  };

  // ── Email (mailto: ouvre l'app mail native) ──────────────
  const partagerEmail = () => {
    const sujet = encodeURIComponent(sujetEmail);
    const corps = encodeURIComponent(texte);
    window.location.href = `mailto:?subject=${sujet}&body=${corps}`;
    setOuvert(false);
  };

  // ── Copier dans le presse-papier ─────────────────────────
  const copierTexte = () => {
    navigator.clipboard.writeText(texte).then(() => {
      setCopie(true);
      setTimeout(() => {
        setCopie(false);
        setOuvert(false);
      }, 1800);
    });
  };

  // ── Si l'API Web Share est disponible (iOS/Android) ──────
  // → UN seul bouton suffit, la feuille système gère tout
  if (peutPartagerNativement) {
    return (
      <button
        onClick={partagerNatif}
        className={`btn-terrain btn-primary ${compact ? "w-full text-sm" : "w-full"}`}
        style={compact ? { minHeight: 48 } : {}}
      >
        <Share2 className={compact ? "w-4 h-4" : "w-5 h-5"} />
        Partager le rapport
      </button>
    );
  }

  // ── Sinon → mini-menu avec 3 options ─────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setOuvert(!ouvert)}
        className={`btn-terrain btn-primary ${compact ? "w-full text-sm" : "w-full"}`}
        style={compact ? { minHeight: 48 } : {}}
      >
        <Share2 className={compact ? "w-4 h-4" : "w-5 h-5"} />
        Partager le rapport
      </button>

      {ouvert && (
        <>
          {/* Overlay fermer */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOuvert(false)}
          />

          {/* Menu */}
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-black text-gray-800 text-sm">Envoyer via…</p>
              <button
                onClick={() => setOuvert(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* WhatsApp */}
            <button
              onClick={partagerWhatsApp}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-green-50 transition-colors border-b border-gray-50"
            >
              <div className="w-11 h-11 bg-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-800">WhatsApp</p>
                <p className="text-xs text-gray-500">
                  Ouvre l&apos;application WhatsApp installée
                </p>
              </div>
            </button>

            {/* Email */}
            <button
              onClick={partagerEmail}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-blue-50 transition-colors border-b border-gray-50"
            >
              <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-800">Email</p>
                <p className="text-xs text-gray-500">
                  Ouvre votre application de messagerie
                </p>
              </div>
            </button>

            {/* Copier */}
            <button
              onClick={copierTexte}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="w-11 h-11 bg-gray-200 rounded-2xl flex items-center justify-center flex-shrink-0">
                {copie ? (
                  <Check className="w-6 h-6 text-green-600" />
                ) : (
                  <Copy className="w-6 h-6 text-gray-600" />
                )}
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-800">
                  {copie ? "Copié !" : "Copier le texte"}
                </p>
                <p className="text-xs text-gray-500">
                  {copie
                    ? "Collez-le dans n'importe quelle application"
                    : "Copiez et collez dans SMS, Telegram…"}
                </p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
