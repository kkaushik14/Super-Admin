import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Privacy policy · Super Admin",
  description:
    "How Super Admin handles administrator identity, sessions and connected-project records.",
};
export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <header>
        <Link href="/login">Super Admin</Link>
        <h1>Privacy policy</h1>
        <p>Updated 6 November 2026</p>
      </header>
      <p>
        Super Admin is a private administration workspace at www.reelogram.org
        for an explicitly authorized owner to inspect and manage connected
        projects. This policy covers Super Admin. Connected applications have
        their own policies for the information they collect from their users.
      </p>
      <section>
        <h2>Google sign-in information</h2>
        <p>
          Super Admin requests Google’s basic identity scopes: openid, email and
          profile. Google may return your account identifier, email address,
          verification status, name and profile image. We use your verified
          email and stable Google account identifier to authorize the configured
          owner. We also request Google’s authentication-time claim to check
          whether sensitive actions have recent authorization.
        </p>
        <p>
          We store the owner’s email, Google account identifier, access status
          and session information in Super Admin’s separate database. We do not
          store Google access tokens, ID tokens or refresh tokens. We do not
          request access to Gmail, Drive, Contacts or Calendar. Google identity
          information is used for authentication, authorization and related
          security auditing, not advertising or sale.
        </p>
      </section>
      <section>
        <h2>Connected-project information</h2>
        <p>
          The authorized owner can view account, video and operational summaries
          supplied by a connected project’s administration API. Project
          connections use separate server credentials. When an action is
          prepared or performed, Super Admin stores its project, target
          identifier and label, reason, reviewed revision, administrator
          identity, command identifier, attempts and outcome. Connected projects
          receive the signed command and stable owner identifier needed to
          authorize and audit that action.
        </p>
      </section>
      <section>
        <h2>Cookies and security records</h2>
        <p>
          Essential cookies maintain sign-in and protect authentication
          requests. Administrator sessions expire after eight hours and are
          checked against server-side records. Signing out revokes the current
          app session. Rate-limit records and session records have expiry
          settings; database cleanup may occur after the recorded expiry.
          Infrastructure providers may process technical request and security
          logs to operate and protect the service.
        </p>
      </section>
      <section>
        <h2>Storage and sharing</h2>
        <p>
          Super Admin uses its own MongoDB database and credentials, separate
          from connected applications. Hosting, database and identity providers,
          including Vercel, MongoDB Atlas and Google, process information
          necessary to provide their services. Authorized operators with
          infrastructure or database access may access stored records for
          administration and security. Super Admin does not make project records
          publicly available through its dashboard and does not sell Google
          identity information or use it for advertising.
        </p>
      </section>
      <section>
        <h2>Retention and control</h2>
        <p>
          Owner and project records remain while needed to maintain the
          configured workspace. Administrative command and audit records have no
          automatic expiry: preserving command IDs and receipts prevents a
          previously executed command from being replayed as new. Backups and
          infrastructure logs may follow their providers’ or operators’
          retention settings.
        </p>
        <p>
          You can revoke Google authorization in your Google Account settings.
          Removing the configured owner allowlist entry or disabling the
          administrator record prevents further app access. Revoking Google
          access does not by itself terminate an existing Super Admin session or
          erase audit records. Contact us to request access, correction or
          deletion of information; requests are reviewed with the security and
          audit records needed to operate the workspace safely.
        </p>
      </section>
      <section>
        <h2>Contact and updates</h2>
        <p>
          For privacy questions or requests, contact{" "}
          <a href="mailto:reelogram.admin@gmail.com">
            reelogram.admin@gmail.com
          </a>
          . Updates to this policy will appear on this page with a revised date.
        </p>
      </section>
      <Link className="secondary" href="/login">
        Back to sign-in
      </Link>
    </main>
  );
}
