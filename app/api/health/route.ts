import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const connection = await connectToDatabase();
    const database = connection.connection.db;
    if (!database) throw new Error("Database connection is not ready.");
    await database.command({ ping: 1 });
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Readiness check failed:", error);
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
