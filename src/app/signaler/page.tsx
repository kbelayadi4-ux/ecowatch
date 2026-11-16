import type { Metadata } from "next";
import SignalementPublic from "@/components/SignalementPublic";

export const metadata: Metadata = {
  title: "EcoWatch SCG — Signaler un problème",
  description:
    "Formulaire public de signalement environnemental EcoWatch SCG. Aucun compte nécessaire : signalez en quelques secondes depuis votre téléphone.",
  alternates: { canonical: "/signaler" },
};

export default function PageSignaler() {
  return <SignalementPublic />;
}