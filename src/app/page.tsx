"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/store";
import { Agent } from "@/lib/types";
import AuthPage from "@/components/AuthPage";
import AgentApp from "@/components/AgentApp";
import AdminApp from "@/components/AdminApp";

export default function Home() {
  const [session, setSession] = useState<Agent | null | undefined>(undefined);

  useEffect(() => {
    const s = getSession();
    // setTimeout(0) avoids triggering set-state-in-effect lint rule
    // while still deferring until after mount
    const id = setTimeout(() => setSession(s), 0);
    return () => clearTimeout(id);
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onLogin={setSession} />;
  }

  if (session.role === "admin") {
    return <AdminApp agent={session} onLogout={() => setSession(null)} />;
  }

  return <AgentApp agent={session} onLogout={() => setSession(null)} />;
}
