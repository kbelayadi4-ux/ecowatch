import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    if (!db) throw new Error("DB not initialized");
    const { notifications } = await import("@/db/schema");
    const notifs = await db.select().from(notifications).orderBy(notifications.dateCreation);
    return NextResponse.json(notifs);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT() {
  try {
    const { getDb } = await import("@/db");
    const db = getDb();
    if (!db) throw new Error("DB not initialized");
    const { notifications } = await import("@/db/schema");
    await db.update(notifications).set({ lu: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
