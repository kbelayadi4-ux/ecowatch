"use client";

import { useEffect, useState } from "react";
import { Agent } from "@/lib/types";
import { getCurrentAgent, onAuthChange, signOut } from "@/lib/auth";
import AuthPage from "@/components/AuthPage";
import AgentApp from "@/components/AgentApp";
import AdminApp from "@/components/AdminApp";

export default function Home() {
  const [session, setSession] = useState<Agent | null | undefined>(undefined);

  useEffect(() => {
    // Check for existing Supabase session
    const checkSession = async () => {
      const agent = await getCurrentAgent();
      setSession(agent);
    };
    checkSession();

    // Listen for auth changes
    const unsub = onAuthChange((agent) => {
      setSession(agent);
    });

    return () => unsub();
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
    return <AdminApp agent={session} onLogout={() => { signOut(); setSession(null); }} />;
  }

  return <AgentApp agent={session} onLogout={() => { signOut(); setSession(null); }} />;
}
