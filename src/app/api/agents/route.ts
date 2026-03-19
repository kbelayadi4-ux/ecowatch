import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const telephone = searchParams.get("telephone");
  
  if (!telephone) {
    const allAgents = await db.select().from(agents);
    return NextResponse.json(allAgents);
  }
  
  try {
    const result = await db.select().from(agents).where(eq(agents.telephone, telephone)).limit(1);
    if (result.length === 0) {
      return NextResponse.json({ error: "Agent non trouvé" }, { status: 404 });
    }
    return NextResponse.json(result[0]);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
