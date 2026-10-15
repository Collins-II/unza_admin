import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Public registration is disabled. Staff accounts are provisioned by a university administrator." },
    { status: 403 }
  );
}
