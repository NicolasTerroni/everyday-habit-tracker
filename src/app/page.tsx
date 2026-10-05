import { currentSession } from "@/lib/session";
import { AuthScreen } from "@/components/auth-screen";
import { HabitApp } from "@/components/habit-app";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await currentSession();
  if (!session) {
    // A password reset link redirects here with ?token=… (valid) or ?error=INVALID_TOKEN (expired or used).
    const { token, error } = await searchParams;
    return <AuthScreen resetToken={typeof token === "string" ? token : undefined} resetError={error === "INVALID_TOKEN"} />;
  }
  return <HabitApp user={{
    name: session.user.name,
    email: session.user.email,
    timezone: session.user.timezone || "Europe/Rome"
  }} />;
}
