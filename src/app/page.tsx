import { currentSession } from "@/lib/session";
import { AuthScreen } from "@/components/auth-screen";
import { HabitApp } from "@/components/habit-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session) return <AuthScreen />;
  return <HabitApp user={{
    name: session.user.name,
    email: session.user.email,
    timezone: session.user.timezone || "Europe/Rome"
  }} />;
}
