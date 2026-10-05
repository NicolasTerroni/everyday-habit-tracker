import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";

// A personal integration (e.g. a Telegram bot) acts for one account without a browser session.
// Vercel stores only the token's SHA-256, so the env var alone cannot be used to call these routes.
function tokenMatches(request: NextRequest) {
  const expected = process.env.INTEGRATION_TOKEN_SHA256?.trim().toLowerCase();
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !/^[0-9a-f]{64}$/.test(expected) || token.length < 32) return false;
  const digest = createHash("sha256").update(token).digest();
  return timingSafeEqual(digest, Buffer.from(expected, "hex"));
}

// The integration's account, or the response to send instead.
export async function integrationOwner(request: NextRequest) {
  const email = process.env.INTEGRATION_USER_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.INTEGRATION_TOKEN_SHA256) {
    return { error: NextResponse.json({ error: "Integration is not configured" }, { status: 404 }) };
  }
  if (!tokenMatches(request)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const [owner] = await db.select({ id: user.id, timezone: user.timezone }).from(user).where(eq(user.email, email)).limit(1);
  if (!owner) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { owner: { id: owner.id, timezone: owner.timezone || "Europe/Rome" } };
}

export function integrationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 400 });
}
