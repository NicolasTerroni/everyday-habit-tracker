"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup" | "forgot" | "reset";

const COPY: Record<Mode, { eyebrow: string; title: string; subtitle: string; button: string }> = {
  signin: { eyebrow: "WELCOME BACK", title: "Continue your day", subtitle: "Your habits are waiting.", button: "Sign in" },
  signup: { eyebrow: "BEGIN YOUR RECORD", title: "Create your space", subtitle: "No card, no subscription, no noise.", button: "Create account" },
  forgot: { eyebrow: "FORGOT YOUR PASSWORD", title: "Get a reset link", subtitle: "We'll email you a link to choose a new password.", button: "Send reset link" },
  reset: { eyebrow: "NEW PASSWORD", title: "Choose a new password", subtitle: "Then sign in with it.", button: "Save new password" }
};

export function AuthScreen({ resetToken, resetError = false }: { resetToken?: string; resetError?: boolean }) {
  // A reset link lands on "/?token=…" (valid) or "/?error=INVALID_TOKEN" (expired or already used); the page passes them in.
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : resetError ? "forgot" : "signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(resetError && !resetToken ? "That reset link is invalid or has expired. Request a new one." : "");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState(resetToken || "");

  // Drop the token from the address bar so it isn't left in history or shared by accident.
  useEffect(() => {
    if (resetToken || resetError) window.history.replaceState(null, "", window.location.pathname);
  }, [resetToken, resetError]);

  function switchTo(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    if (mode === "forgot") {
      const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/` });
      setBusy(false);
      if (result.error) {
        setError(result.error.message || "Something went wrong");
        return;
      }
      setNotice("If an account exists for that email, a reset link is on its way. It expires in 1 hour.");
      return;
    }

    if (mode === "reset") {
      if (password !== String(form.get("confirm"))) {
        setError("The two passwords don't match.");
        setBusy(false);
        return;
      }
      const result = await authClient.resetPassword({ newPassword: password, token });
      setBusy(false);
      if (result.error) {
        setError(result.error.message || "That reset link is invalid or has expired. Request a new one.");
        return;
      }
      setToken("");
      setMode("signin");
      setNotice("Password updated. Sign in with your new password.");
      return;
    }

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

  const copy = COPY[mode];
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
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="muted">{copy.subtitle}</p>
          <form key={mode} onSubmit={submit} className="form-stack">
            {mode === "signup" && <label>Your name<input name="name" autoComplete="name" required maxLength={80} placeholder="How should we call you?" /></label>}
            {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>}
            {mode !== "forgot" && <label>{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} maxLength={128} required placeholder="At least 8 characters" /></label>}
            {mode === "reset" && <label>Repeat the new password<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Same as above" /></label>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="primary-button" disabled={busy}>{busy ? "One moment…" : copy.button}<ArrowRight size={17} /></button>
          </form>
          {mode === "signin" && <button className="text-button auth-forgot" onClick={() => switchTo("forgot")}>Forgot your password?</button>}
          <button className="text-button auth-switch" onClick={() => switchTo(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
