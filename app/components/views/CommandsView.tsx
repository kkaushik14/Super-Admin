"use client";
import { useEffect, useState } from "react";
import { actionLabels, type CommandSummary } from "../CommandDialog";
export default function CommandsView({
  open,
  revision,
}: {
  open: (id: string) => void;
  revision: unknown;
}) {
  const [commands, setCommands] = useState<CommandSummary[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/actions", { signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401) return { commands: [] };
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        setCommands(d.commands);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("Unable to load saved commands. Refresh to try again.");
      });
    return () => controller.abort();
  }, [revision]);
  if (!commands.length && !error) return null;
  return (
    <section className="panel command-history">
      <div className="panel-heading">
        <h2>Saved commands</h2>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action / record</th>
                <th>Project</th>
                <th>Outcome</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{actionLabels[c.action]}</strong>
                    <small>{c.label}</small>
                  </td>
                  <td>{c.projectId}</td>
                  <td>{c.state}</td>
                  <td>
                    <button className="secondary" onClick={() => open(c.id)}>
                      Review command
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
