import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    if (!db) throw new Error("DB not initialized");
    const { agents } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { searchParams } = new URL(request.url);
    const telephone = searchParams.get("telephone");
    
    if (telephone) {
      const result = await db.select().from(agents).where(eq(agents.telephone, telephone)).limit(1);
      if (result.length === 0) return NextResponse.json({ error: "Agent non trouvé" }, { status: 404 });
      return NextResponse.json(result[0]);
    }
    
    const allAgents = await db.select().from(agents);
    return NextResponse.json(allAgents);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    if (!db) throw new Error("DB not initialized");
    const { agents } = await import("@/db/schema");
    const body = await request.json();
    const agent = {
      id: body.id,
      telephone: body.telephone,
      nom: body.nom,
      role: body.role,
      createdAt: new Date(),
    };
    await db.insert(agents).values(agent);
    return NextResponse.json({ ok: true, agent });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
