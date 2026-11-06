import { googleAuthenticationEvidence } from "./actions/policy.ts";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import {
  appOrigin,
  authConfigured,
  devLoginEnabled,
  devPasswordHash,
  googleConfigured,
} from "./config/environment.ts";
import {
  googleAdmin,
  devAdmin,
  issueSession,
  sessionIdentity,
  revokeSession,
} from "./auth/accounts.ts";
import { digest, safeRedirect } from "./auth/policy.ts";
import { rateLimit, audit } from "./store.ts";
export function authOptions(): NextAuthOptions {
  if (!authConfigured()) throw Error("Administrator sign-in is not configured");
  const origin = appOrigin();
  // NextAuth requires these reserved names. Never fall back to another project's values.
  process.env.NEXTAUTH_URL = origin;
  process.env.NEXTAUTH_SECRET = process.env.SUPERADMIN_AUTH_SECRET;
  delete process.env.NEXTAUTH_URL_INTERNAL;
  const providers: NextAuthOptions["providers"] = [];
  if (googleConfigured())
    providers.push(
      GoogleProvider({
        clientId: process.env.SUPERADMIN_GOOGLE_CLIENT_ID!,
        clientSecret: process.env.SUPERADMIN_GOOGLE_CLIENT_SECRET!,
        checks: ["pkce", "state", "nonce"],
        authorization: {
          params: {
            scope: "openid email profile",
            prompt: "select_account",
            access_type: "online",
            claims: JSON.stringify({
              id_token: { auth_time: { essential: true } },
            }),
          },
        },
      }),
    );
  if (devLoginEnabled())
    providers.push(
      CredentialsProvider({
        id: "dev-test",
        name: "Development test account",
        credentials: {
          email: { type: "email" },
          password: { type: "password" },
        },
        async authorize(credentials) {
          if (
            !devLoginEnabled() ||
            typeof credentials?.email !== "string" ||
            typeof credentials.password !== "string" ||
            credentials.email.length > 254 ||
            credentials.password.length > 128
          )
            return null;
          await rateLimit("dev-login:global", 30);
          await rateLimit(
            "dev-login:" + digest(credentials.email.toLowerCase()),
          );
          const matches = await bcrypt.compare(
            credentials.password,
            devPasswordHash(),
          );
          if (
            !matches ||
            credentials.email.trim().toLowerCase() !==
              process.env.SUPERADMIN_DEV_EMAIL!.trim().toLowerCase()
          )
            return null;
          const admin = await devAdmin();
          return admin ? { id: String(admin._id), email: admin.email } : null;
        },
      }),
    );
  return {
    providers,
    secret: process.env.SUPERADMIN_AUTH_SECRET,
    useSecureCookies: origin.startsWith("https:"),
    cookies: Object.fromEntries(
      [
        "sessionToken",
        "callbackUrl",
        "csrfToken",
        "pkceCodeVerifier",
        "state",
        "nonce",
      ].map((key) => {
        const secure = origin.startsWith("https:");
        const name = key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
        return [
          key,
          {
            name:
              (secure ? (key === "csrfToken" ? "__Host-" : "__Secure-") : "") +
              "superadmin." +
              name,
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure,
              ...(["pkceCodeVerifier", "state", "nonce"].includes(key)
                ? { maxAge: 900 }
                : {}),
            },
          },
        ];
      }),
    ),
    session: { strategy: "jwt", maxAge: 8 * 3600 },
    pages: { signIn: "/login", error: "/login" },
    logger: {
      error(code) {
        console.error("Authentication error:", code);
      },
      warn(code) {
        console.warn("Authentication warning:", code);
      },
      debug() {},
    },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider === "google") {
          const admin = await googleAdmin(profile);
          if (!admin) return false;
          user.id = String(admin._id);
          user.email = admin.email;
          return true;
        }
        return account?.provider === "dev-test" && devLoginEnabled();
      },
      async jwt({ token, user, account, profile }) {
        if (user && account) {
          const evidence = googleAuthenticationEvidence(profile);
          token.sid = await issueSession(
            user.id,
            account.provider,
            account.provider === "google" ? evidence.time : 0,
            account.provider === "google" ? evidence.claim : "unknown",
          );
          await audit(
            user.email || "owner",
            "system",
            "session.login",
            account.provider,
            "Administrator sign-in",
            "succeeded",
          );
        }
        const identity = await sessionIdentity(token.sid);
        if (!identity) return {};
        return {
          sid: token.sid,
          email: identity.email,
          sub: identity.id,
          provider: identity.provider,
        };
      },
      async session({ session, token }) {
        const identity = await sessionIdentity(token.sid);
        if (identity)
          session.user = {
            email: identity.email,
            name:
              identity.provider === "dev-test"
                ? "Development account"
                : "Administrator",
            image: null,
          };
        else session.user = undefined;
        return session;
      },
      async redirect({ url }) {
        return safeRedirect(url, origin);
      },
    },
    events: {
      async signOut({ token }) {
        await revokeSession(token?.sid);
      },
    },
  };
}
