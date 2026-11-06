"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { googleVerificationParameters } from "@/lib/actions/google-verification";
type Verification = {
  fresh: boolean;
  claim: "present" | "missing" | "invalid" | "unknown";
};
export default function GoogleVerification() {
  const [status, setStatus] = useState<Verification | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/actions", { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setStatus({ fresh: d.fresh, claim: d.authenticationClaim });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);
  return (
    <section className="panel settings-card">
      <h2>Action authorization</h2>
      <p>
        Check Google authorization before enabling or confirming administrative
        actions.
      </p>
      <div className="detail">
        <span>Authorization</span>
        <b>
          {status?.fresh
            ? "Fresh Google authentication"
            : status
              ? "Not ready"
              : "Checking…"}
        </b>
      </div>
      {status && !status.fresh && (
        <p>
          {status.claim === "missing"
            ? "Google did not return its authentication-time claim. Check Session age claims in the Google Auth Platform settings."
            : status.claim === "present"
              ? "Google returned an older authentication time. Sign in to Google in a fresh browser session, then return here."
              : "Verify with Google to check the authentication-time claim."}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await signIn(
              "google",
              { callbackUrl: "/?verification=1" },
              googleVerificationParameters,
            );
          } catch {
            setError("Unable to start Google verification");
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening Google…" : "Verify with Google"}
      </button>
      <p>
        Google account selection alone does not prove fresh authentication.
        Project actions stay disabled until their own configuration is enabled.
      </p>
    </section>
  );
}
