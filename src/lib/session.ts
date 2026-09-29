import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function currentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await currentSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export function apiError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 400 });
}
