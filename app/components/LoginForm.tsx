"use client";
import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Layers, ArrowRight, ShieldCheck } from "lucide-react";
export default function LoginForm({
  google,
  development,
  failed,
}: {
  google: boolean;
  development: boolean;
  failed: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login">
      <section className="login-brand">
        <Layers size={40} />
        <h1>
          Your projects.
          <br />
          One workspace.
        </h1>
        <p>
          Manage connected applications with clear permissions and a record of
          every action.
        </p>
      </section>
      <section className="login-form">
        <ShieldCheck size={28} />
        <h2>Sign in to Super Admin</h2>
        <p>Use your authorized Google account to continue.</p>
        <button
          className="primary google-login"
          disabled={!google || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signIn("google", { callbackUrl: "/" });
            } catch {
              setError("Unable to start Google sign-in. Try again.");
              setBusy(false);
            }
          }}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22ZM6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.51l3.35-2.59ZM12 5.96c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
            />
          </svg>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>
        {!google && (
          <p className="configuration-note">
            Google sign-in is awaiting configuration.
          </p>
        )}
        {development && (
          <details className="dev-login">
            <summary>Development test account</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(e.currentTarget);
                try {
                  const result = await signIn("dev-test", {
                    email: form.get("email"),
                    password: form.get("password"),
                    redirect: false,
                    callbackUrl: "/",
                  });
                  if (result?.error || !result?.ok) throw Error();
                  location.assign("/");
                } catch {
                  setError(
                    "Sign-in failed. Check the test credentials or try again later.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Test email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                />
              </label>
              <label>
                Test password
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                />
              </label>
              <button className="secondary" disabled={busy}>
                Sign in for testing <ArrowRight size={16} />
              </button>
            </form>
          </details>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {failed && (
          <p className="error" role="alert">
            Sign-in could not be completed. Use the authorized Google account
            and try again.
          </p>
        )}
        <Link className="privacy-link" href="/privacy">
          Privacy policy
        </Link>
      </section>
    </main>
  );
}
