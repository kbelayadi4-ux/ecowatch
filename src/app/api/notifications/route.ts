import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const notifs = await db.select().from(notifications).orderBy(notifications.dateCreation);
    return NextResponse.json(notifs);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT() {
  try {
    await db.update(notifications).set({ lu: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
