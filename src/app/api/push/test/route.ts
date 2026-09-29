import { NextResponse } from "next/server";
import { apiError, requireSession } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireSession();
    const sent = await sendPushToUser(session.user.id, {
      title: "Everyday is ready",
      body: "Your habit reminders are connected.",
      url: "/",
      tag: "everyday-test"
    });
    return NextResponse.json({ sent });
  } catch (error) {
    return apiError(error);
  }
}
