import { Observation, Agent } from "./types";

const OBSERVATIONS_KEY = "eco_observations";
const AGENTS_KEY = "eco_agents";
const SESSION_KEY = "eco_session";
const NOTIF_KEY = "eco_notifs";

// ── Événement custom pour notifier en temps réel ──────────────
// Déclenché quand une nouvelle observation est sauvegardée
export const ECO_NEW_OBS_EVENT = "eco:nouvelle_observation";

function diffuserNouvelleObs(obs: Observation) {
  if (typeof window === "undefined") return;
  // Même onglet
  window.dispatchEvent(new CustomEvent(ECO_NEW_OBS_EVENT, { detail: obs }));
  // Autres onglets (via storage event trick)
  try {
    localStorage.setItem("eco_trigger", JSON.stringify({ id: obs.id, ts: Date.now() }));
    localStorage.removeItem("eco_trigger");
  } catch { /* silencieux */ }
}

// ── Compression photo ─────────────────────────────────────────
// Réduit le base64 à max ~200KB en redimensionnant + qualité JPEG
export function compresserPhoto(base64: string, maxPx = 800, qualite = 0.7): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(base64); return; }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(base64); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", qualite));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

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

export function saveObservation(obs: Observation): { ok: boolean; erreur?: string } {
  try {
    const list = getObservations();
    list.unshift(obs); // plus récent en premier
    localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(list));
    // Incrémenter le compteur de notifications non lues
    ajouterNotif(obs);
    // Diffuser l'événement aux autres composants
    diffuserNouvelleObs(obs);
    return { ok: true };
  } catch (e) {
    // QuotaExceededError : réessayer sans la photo
    if (obs.photo) {
      try {
        const obsSansPhoto = { ...obs, photo: undefined };
        const list = getObservations();
        list.unshift(obsSansPhoto);
        localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(list));
        ajouterNotif(obsSansPhoto);
        diffuserNouvelleObs(obsSansPhoto);
        return { ok: true, erreur: "photo_ignoree" };
      } catch {
        return { ok: false, erreur: "stockage_plein" };
      }
    }
    return { ok: false, erreur: String(e) };
  }
}

export function getObservationsByAgent(agentId: string): Observation[] {
  return getObservations().filter((o) => o.agentId === agentId);
}

// ── Notifications (compteur non lus pour admin) ───────────────
export interface Notif {
  obsId: string;
  agentNom: string;
  typeProbleme: string;
  zone: string;
  dateCreation: string;
  lu: boolean;
}

function ajouterNotif(obs: Observation) {
  const notifs = getNotifs();
  notifs.unshift({
    obsId: obs.id,
    agentNom: obs.agentNom,
    typeProbleme: obs.typeProbleme,
    zone: obs.zone,
    dateCreation: obs.dateCreation,
    lu: false,
  });
  // Garder max 50 notifications
  const tronquees = notifs.slice(0, 50);
  localStorage.setItem(NOTIF_KEY, JSON.stringify(tronquees));
}

export function getNotifs(): Notif[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getNotifsNonLues(): number {
  return getNotifs().filter((n) => !n.lu).length;
}

export function marquerToutLu() {
  const notifs = getNotifs().map((n) => ({ ...n, lu: true }));
  localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs));
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
  if (idx >= 0) { agents[idx] = agent; } else { agents.push(agent); }
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

// ── ID ────────────────────────────────────────────────────────
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
