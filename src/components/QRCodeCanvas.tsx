"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Copy, Check } from "lucide-react";

export default function QRCodeCanvas() {
  const [url, setUrl] = useState("");
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setUrl(window.location.origin), 0);
    return () => clearTimeout(id);
  }, []);

  const copierLien = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
        <h3 className="font-black text-gray-800 text-lg mb-1">
          Partager l&apos;application
        </h3>
        <p className="text-gray-500 text-sm mb-6">
          Scannez le code QR avec un smartphone pour accéder à l&apos;application
        </p>

        {url && (
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-white rounded-2xl border-2 border-green-200 shadow-inner inline-block">
              <QRCodeSVG
                value={url}
                size={200}
                bgColor="#ffffff"
                fgColor="#15803d"
                level="H"
                includeMargin={false}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-4 break-all font-mono bg-gray-50 rounded-xl p-2">
          {url}
        </p>

        <button
          onClick={copierLien}
          className="btn-terrain btn-primary mx-auto px-8"
          style={{ width: "auto" }}
        >
          {copie ? (
            <>
              <Check className="w-5 h-5" /> Lien copié !
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" /> Copier le lien
            </>
          )}
        </button>
      </div>

      <div className="bg-green-50 rounded-2xl p-5 border border-green-200">
        <h4 className="font-bold text-green-800 flex items-center gap-2 mb-3">
          <Smartphone className="w-5 h-5" />
          Instructions pour les agents
        </h4>
        <ol className="text-sm text-green-700 space-y-2 list-decimal list-inside">
          <li>Scannez le QR code avec l&apos;appareil photo de votre téléphone</li>
          <li>Ouvrez le lien dans le navigateur</li>
          <li>Entrez votre numéro de téléphone (sans +216)</li>
          <li>Entrez votre nom lors de la première connexion</li>
          <li>Commencez à signaler des observations !</li>
        </ol>
        <div className="mt-4 bg-white rounded-xl p-3 border border-green-200">
          <p className="text-xs font-bold text-gray-600 mb-1">
            Connexion administrateur :
          </p>
          <p className="text-xs text-gray-500">
            Modifiez <code className="bg-gray-100 px-1 rounded">ADMIN_PHONES</code> dans{" "}
            <code className="bg-gray-100 px-1 rounded">src/lib/types.ts</code> pour ajouter
            des numéros admin.
          </p>
        </div>
      </div>
    </div>
  );
}
