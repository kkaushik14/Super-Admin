"use client";
import Link from "next/link";
import { ShieldCheck, Globe } from "lucide-react";
import type { Snapshot } from "@/lib/types";
export default function SettingsView({ data }: { data: Snapshot }) {
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <ShieldCheck size={24} />
        <h2>Administrator access</h2>
        <p>Production access uses your authorized Google account.</p>
        <div className="detail">
          <span>Current access</span>
          <b>{data.preview ? "Read-only preview" : "Authenticated owner"}</b>
        </div>
        <div className="detail">
          <span>Session lifetime</span>
          <b>8 hours</b>
        </div>
        <Link className="secondary" href="/login">
          {data.preview ? "Sign in" : "Open sign-in"}
        </Link>
      </section>
      <section className="panel settings-card">
        <Globe size={24} />
        <h2>Deployment & connections</h2>
        <p>
          Your custom domain can be configured later. Project hosts and
          credentials are managed through server configuration.
        </p>
        <div className="detail">
          <span>Storage</span>
          <b>Dedicated MongoDB database</b>
        </div>
        <div className="detail">
          <span>Project isolation</span>
          <b>Independent credentials</b>
        </div>
        <p className="fine">
          Ready for Vercel with independent database credentials. Configure the
          public origin before enabling production access.
        </p>
      </section>
    </div>
  );
}
