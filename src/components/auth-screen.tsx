"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const result = mode === "signin"
      ? await authClient.signIn.email({ email, password, rememberMe: true })
      : await authClient.signUp.email({
          email,
          password,
          name: String(form.get("name"))
        });
    if (result.error) {
      setError(result.error.message || "Something went wrong");
      setBusy(false);
      return;
    }
    if (mode === "signup") {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome" })
      });
    }
    window.location.reload();
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand brand-large"><span className="brand-mark"><Check size={19} /></span> everyday</div>
        <div className="story-copy">
          <p className="eyebrow">A QUIET RECORD</p>
          <h1>Small things,<br /><em>beautifully kept.</em></h1>
          <p>Track the habits that shape your days without streaks, scores, or pressure.</p>
        </div>
        <p className="story-foot">Private by design · Your history belongs to you</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">{mode === "signin" ? "WELCOME BACK" : "BEGIN YOUR RECORD"}</p>
          <h2>{mode === "signin" ? "Continue your day" : "Create your space"}</h2>
          <p className="muted">{mode === "signin" ? "Your habits are waiting." : "No card, no subscription, no noise."}</p>
          <form onSubmit={submit} className="form-stack">
            {mode === "signup" && <label>Your name<input name="name" autoComplete="name" required maxLength={80} placeholder="How should we call you?" /></label>}
            <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
            <label>Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required placeholder="At least 8 characters" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
          </form>
          <button className="text-button auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
