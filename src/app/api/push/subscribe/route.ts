import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) })
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const data = subscriptionSchema.parse(await request.json());
    const [saved] = await db.insert(pushSubscriptions).values({
      userId: session.user.id,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth
    }).onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: session.user.id, p256dh: data.keys.p256dh, auth: data.keys.auth, lastSeenAt: new Date(), updatedAt: new Date() }
    }).returning();
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await request.json());
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, session.user.id)));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
