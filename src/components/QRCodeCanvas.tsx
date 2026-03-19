"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Copy, Check, Share2, ExternalLink } from "lucide-react";

export default function QRCodeCanvas() {
  const [url, setUrl] = useState("");
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    // Utilise l'URL complète de l'application déployée
    const id = setTimeout(() => {
      setUrl(window.location.href.split("?")[0].replace(/\/$/, ""));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const copierLien = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    });
  };

  // Partage natif du lien (iOS/Android)
  const partagerLien = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "EcoWatch – Application de signalement",
          text: "Accédez à l'application EcoWatch pour signaler des observations terrain.",
          url,
        });
      } catch { /* annulé */ }
    } else {
      copierLien();
    }
  };

  return (
    <div className="space-y-5">
      {/* QR Code principal */}
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
        <h3 className="font-black text-gray-800 text-lg mb-1">
          Partager l&apos;application
        </h3>
        <p className="text-gray-500 text-sm mb-5">
          Scannez ce code ou envoyez le lien aux agents
        </p>

        {/* QR Code */}
        {url ? (
          <div className="flex justify-center mb-5">
            <div className="p-4 bg-white rounded-2xl border-2 border-green-300 shadow-md inline-block">
              <QRCodeSVG
                value={url}
                size={210}
                bgColor="#ffffff"
                fgColor="#15803d"
                level="H"
                includeMargin={false}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-5">
            <div className="w-[210px] h-[210px] bg-gray-100 rounded-2xl animate-pulse" />
          </div>
        )}

        {/* URL lisible */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs text-gray-700 font-mono break-all flex-1 text-left">
            {url || "Chargement…"}
          </p>
        </div>

        {/* Boutons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={copierLien}
            className="btn-terrain btn-secondary text-sm"
            style={{ minHeight: 52 }}
          >
            {copie ? (
              <><Check className="w-4 h-4 text-green-600" /> Copié !</>
            ) : (
              <><Copy className="w-4 h-4" /> Copier</>
            )}
          </button>
          <button
            onClick={partagerLien}
            className="btn-terrain btn-primary text-sm"
            style={{ minHeight: 52 }}
          >
            <Share2 className="w-4 h-4" />
            Envoyer
          </button>
        </div>
      </div>

      {/* Instructions agents */}
      <div className="bg-green-50 rounded-2xl p-5 border border-green-200">
        <h4 className="font-bold text-green-800 flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5" />
          Comment accéder à l&apos;application
        </h4>
        <div className="space-y-3">
          {[
            { n: "1", texte: "Scannez le QR code avec la caméra de votre téléphone", detail: "Ou envoyez le lien par WhatsApp / SMS" },
            { n: "2", texte: "Ouvrez le lien dans votre navigateur", detail: "Chrome, Safari, Firefox…" },
            { n: "3", texte: "Entrez votre numéro de téléphone (sans +216)", detail: "Ex : 20 123 456" },
            { n: "4", texte: "Créez votre compte avec votre nom", detail: "Une seule fois, puis connexion automatique" },
            { n: "5", texte: "Appuyez sur Nouvelle Observation !", detail: "L'administrateur est notifié instantanément" },
          ].map(({ n, texte, detail }) => (
            <div key={n} className="flex gap-3">
              <div className="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center font-black text-sm flex-shrink-0">
                {n}
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">{texte}</p>
                <p className="text-xs text-green-600 mt-0.5">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info accès admin */}
      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200">
        <p className="text-xs font-bold text-blue-700 mb-1 flex items-center gap-1.5">
          🔐 Connexion Administrateur
        </p>
        <p className="text-xs text-blue-600">
          Lors de la création de compte, choisissez <strong>Admin</strong> et entrez le code d&apos;accès secret.
          Le même lien est utilisé pour les agents et les administrateurs.
        </p>
      </div>
    </div>
  );
}
