"use client";
import { Search, RefreshCw, Unplug } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { statusLabel } from "../shared";
export default function ProjectsView({
  data,
  query,
  setQuery,
  matches,
  execute,
  busy,
  setAction,
}: {
  data: Snapshot;
  query: string;
  setQuery: (s: string) => void;
  matches: (s: string) => boolean;
  execute: (b: Record<string, string>) => Promise<void>;
  busy: boolean;
  setAction: (a: { action: string; target: string }) => void;
}) {
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Find a project…"
            aria-label="Search projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span>{data.projects.length} registered</span>
      </div>
      <div className="project-cards">
        {data.projects
          .filter((p) => matches(p.name + " " + p.origin))
          .map((p) => (
            <section className="panel project-card" key={p.id}>
              <div className="card-top">
                <div className="project-icon violet">{p.name[0]}</div>
                <span className={"badge " + p.status}>
                  <i />
                  {statusLabel(p.status)}
                </span>
              </div>
              <h2>{p.name}</h2>
              <p>{p.origin}</p>
              <div className="detail">
                <span>Environment</span>
                <b>{p.environment}</b>
              </div>
              <div className="detail">
                <span>Supported controls</span>
                <b>{p.capabilities.length || "Awaiting connection"}</b>
              </div>
              <div className="detail">
                <span>Last checked</span>
                <b>
                  {p.lastChecked
                    ? new Date(p.lastChecked).toLocaleString()
                    : "Not checked yet"}
                </b>
              </div>
              <div className="capabilities">
                {p.capabilities.map((c) => (
                  <span className="env" key={c}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="card-actions">
                <button
                  disabled={busy || data.preview}
                  className="secondary"
                  onClick={() =>
                    execute({
                      action: "project.check",
                      projectId: p.id,
                    })
                  }
                >
                  <RefreshCw size={15} />
                  Check connection
                </button>
                <button
                  disabled={busy || data.preview || p.status === "disconnected"}
                  className="icon-button"
                  aria-label={"Disconnect " + p.name}
                  onClick={() =>
                    setAction({
                      action: "project.disconnect",
                      target: p.id,
                    })
                  }
                >
                  <Unplug size={17} />
                </button>
              </div>
            </section>
          ))}
      </div>
      <section className="panel setup">
        <h2>Connect in three steps</h2>
        <div className="setup-steps">
          <div>
            <span>1</span>
            <h3>Register the project</h3>
            <p>Add its name, environment, and approved HTTPS address.</p>
          </div>
          <div>
            <span>2</span>
            <h3>Install the integration</h3>
            <p>
              The project exposes the versioned admin API and explicitly grants
              supported controls.
            </p>
          </div>
          <div>
            <span>3</span>
            <h3>Verify the connection</h3>
            <p>
              Provision a separate server credential, then check the project’s
              identity and capabilities.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
