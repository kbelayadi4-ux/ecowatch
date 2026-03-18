import { Observation, Agent } from "./types";

const OBSERVATIONS_KEY = "eco_observations";
const AGENTS_KEY = "eco_agents";
const SESSION_KEY = "eco_session";

// ── Observations ──────────────────────────────────────────────
export function getObservations(): Observation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OBSERVATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveObservation(obs: Observation): void {
  const list = getObservations();
  list.unshift(obs); // newest first
  localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(list));
}

export function getObservationsByAgent(agentId: string): Observation[] {
  return getObservations().filter((o) => o.agentId === agentId);
}

// ── Agents ────────────────────────────────────────────────────
export function getAgents(): Agent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getAgentByPhone(telephone: string): Agent | null {
  const agents = getAgents();
  return agents.find((a) => a.telephone === telephone) || null;
}

export function saveAgent(agent: Agent): void {
  const agents = getAgents();
  const idx = agents.findIndex((a) => a.id === agent.id);
  if (idx >= 0) {
    agents[idx] = agent;
  } else {
    agents.push(agent);
  }
  localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
}

// ── Session ───────────────────────────────────────────────────
export function getSession(): Agent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(agent: Agent): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(agent));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ── ID generator ──────────────────────────────────────────────
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
