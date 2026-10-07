import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { currentSession } from "@/lib/session";
import { AuthScreen } from "@/components/auth-screen";
import { HabitApp } from "@/components/habit-app";
import { asLockRule } from "@/lib/focus-lock";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await currentSession();
  if (!session) {
    // A password reset link redirects here with ?token=… (valid) or ?error=INVALID_TOKEN (expired or used).
    const { token, error } = await searchParams;
    return <AuthScreen resetToken={typeof token === "string" ? token : undefined} resetError={error === "INVALID_TOKEN"} />;
  }
  // Read from the table, not the session: Better Auth caches the session cookie for 5 minutes.
  const [settings] = await db.select({ lockRule: user.lockRule }).from(user).where(eq(user.id, session.user.id)).limit(1);
  return <HabitApp user={{
    name: session.user.name,
    email: session.user.email,
    timezone: session.user.timezone || "Europe/Rome",
    lockRule: asLockRule(settings?.lockRule)
  }} />;
}
