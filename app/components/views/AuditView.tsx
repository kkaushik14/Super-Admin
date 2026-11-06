"use client";
import { Search, RefreshCw } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { Empty } from "../shared";
export default function AuditView({
  data,
  query,
  setQuery,
  matches,
  refresh,
}: {
  data: Snapshot;
  query: string;
  setQuery: (s: string) => void;
  matches: (s: string) => boolean;
  refresh: () => Promise<void>;
}) {
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search audit history"
            placeholder="Search actions, projects or people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="secondary" onClick={refresh}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action / target</th>
              <th>Project</th>
              <th>Administrator</th>
              <th>Outcome</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {data.audit
              .filter((a) =>
                matches(a.action + a.projectId + a.actor + a.reason),
              )
              .map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.action}</strong>
                    <small>
                      {a.target} · {a.reason}
                    </small>
                    <code>{a.id}</code>
                  </td>
                  <td>{a.projectId}</td>
                  <td>{a.actor}</td>
                  <td>
                    <span className="badge">{a.status}</span>
                  </td>
                  <td>{new Date(a.at).toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!data.audit.length && (
        <Empty
          title="Your audit trail starts here"
          text="Actions, reasons, and outcomes appear here as you manage your workspace."
        />
      )}
    </section>
  );
}
