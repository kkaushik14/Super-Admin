"use client";
import { useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="login-brand">
        <ShieldCheck size={36} />
        <h1>
          A clear view.
          <br />
          Confident control.
        </h1>
        <p>One private workspace for every project you manage.</p>
        <span>SUPER ADMIN / SECURE ACCESS</span>
      </div>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            const r = await fetch("/api/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(f)),
            });
            if (!r.ok) throw Error((await r.json()).error);
            location.href = "/";
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to sign in");
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">YOUR CONTROL ROOM</span>
        <h2>Welcome back</h2>
        <p>Sign in with your administrator credentials.</p>
        <label>
          Email address
          <input required type="email" name="email" autoComplete="username" />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            name="password"
            autoComplete="current-password"
            maxLength={256}
          />
        </label>
        <label>
          Authenticator code
          <input
            required
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in securely"}
          <ArrowRight size={17} />
        </button>
        <p className="fine">
          Initial setup: run <code>npm run admin:create</code> in the project
          terminal.
        </p>
      </form>
    </main>
  );
}
