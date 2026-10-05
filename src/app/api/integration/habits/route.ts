import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { loadHabitData } from "@/lib/habit-data";

export const dynamic = "force-dynamic";

const MAX_DAYS = 400;

// Read-only access for a personal integration (e.g. a Telegram bot), without a browser session.
// Vercel stores only the token's SHA-256, so the env var alone cannot be used to call this route.
function authorized(request: NextRequest) {
  const expected = process.env.INTEGRATION_TOKEN_SHA256?.trim().toLowerCase();
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !/^[0-9a-f]{64}$/.test(expected) || token.length < 32) return false;
  const digest = createHash("sha256").update(token).digest();
  return timingSafeEqual(digest, Buffer.from(expected, "hex"));
}

export async function GET(request: NextRequest) {
  const email = process.env.INTEGRATION_USER_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.INTEGRATION_TOKEN_SHA256) {
    return NextResponse.json({ error: "Integration is not configured" }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [owner] = await db.select({ id: user.id, timezone: user.timezone }).from(user).where(eq(user.email, email)).limit(1);
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const timezone = owner.timezone || "Europe/Rome";
    const to = request.nextUrl.searchParams.get("to") || todayIn(timezone);
    const from = request.nextUrl.searchParams.get("from") || to;
    const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (!(days >= 0 && days <= MAX_DAYS)) {
      return NextResponse.json({ error: `Use a range of 0 to ${MAX_DAYS} days` }, { status: 400 });
    }
    return NextResponse.json(await loadHabitData(owner.id, timezone, from, to, true), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
