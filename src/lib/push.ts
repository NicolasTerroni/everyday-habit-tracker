import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

function configure() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID keys are not configured");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  configure();
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, JSON.stringify(payload), { TTL: 60 * 60, urgency: "normal", topic: payload.tag?.slice(0, 32) });
      sent++;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      } else {
        console.error("Push delivery failed", error);
      }
    }
  }
  return sent;
}
