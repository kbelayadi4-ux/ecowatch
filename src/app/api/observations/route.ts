import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    if (!db) throw new Error("DB not initialized");
    const { observations } = await import("@/db/schema");
    const obs = await db.select().from(observations).orderBy(observations.dateCreation);
    return NextResponse.json(obs);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    if (!db) throw new Error("DB not initialized");
    const { observations, notifications } = await import("@/db/schema");
    const body = await request.json();
    const obs = {
      id: body.id,
      agentId: body.agentId,
      agentNom: body.agentNom,
      agentTelephone: body.agentTelephone,
      typeProbleme: body.typeProbleme,
      commentaire: body.commentaire || "",
      zone: body.zone,
      photo: body.photo || null,
      dateCreation: new Date(body.dateCreation),
      partage: false,
    };
    await db.insert(observations).values(obs);
    await db.insert(notifications).values({
      obsId: obs.id,
      agentNom: obs.agentNom,
      typeProbleme: obs.typeProbleme,
      zone: obs.zone,
      dateCreation: obs.dateCreation,
      lu: false,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
