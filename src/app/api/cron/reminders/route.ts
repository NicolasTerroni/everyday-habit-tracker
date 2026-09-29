import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runReminderEngine } from "@/lib/reminder-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = verifySignatureAppRouter(async () => {
  const result = await runReminderEngine();
  return Response.json(result);
});
