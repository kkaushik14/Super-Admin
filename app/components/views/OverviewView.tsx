"use client";
import {
  Layers,
  History,
  ArrowRight,
  Plus,
  ShieldCheck,
  Check,
  Link2,
  Activity,
  CheckCircle2,
} from "lucide-react";
import type { Snapshot, Project } from "@/lib/types";
import { Stat } from "../shared";
export default function OverviewView({
  data,
  connected,
  needsAttention,
  navigate,
  projectRow,
  setAdd,
  setSelected,
}: {
  data: Snapshot;
  connected: number;
  needsAttention: number;
  navigate: (s: string) => void;
  projectRow: (p: Project) => React.ReactNode;
  setAdd: (v: boolean) => void;
  setSelected: (s: string) => void;
}) {
  return (
    <>
      <div className="stats">
        <Stat
          icon={<Layers size={18} />}
          label="Total projects"
          value={data.projects.length}
        />
        <Stat
          icon={<Activity size={18} />}
          label="Connected"
          value={connected}
          note={
            connected
              ? "Ready for administration"
              : "Waiting for first connection"
          }
          green
        />
        <Stat
          icon={<ShieldCheck size={18} />}
          label="Needs attention"
          value={needsAttention}
          note={
            needsAttention
              ? "Review connection failures"
              : "No reported connection failures"
          }
        />
        <Stat
          icon={<History size={18} />}
          label="Recent actions"
          value={data.audit.length}
        />
      </div>
      <div className="overview-grid">
        <section className="panel projects-panel">
          <div className="panel-heading">
            <div>
              <h2>Your projects</h2>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("Projects")}
            >
              View all <ArrowRight size={15} />
            </button>
          </div>
          {data.projects.map(projectRow)}
          <button className="add-row" onClick={() => setAdd(true)}>
            <Plus size={17} />
            Connect another project
          </button>
        </section>
        <section className="panel attention">
          <div className="panel-heading">
            <h2>Needs your attention</h2>
            <span className="count">{needsAttention}</span>
          </div>
          {needsAttention ? (
            data.projects
              .filter((p) => p.status === "unreachable")
              .map((p) => (
                <div key={p.id} className="attention-item">
                  <b>{p.name} is unreachable</b>
                  <p>Review credentials and the project integration.</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(p.id);
                      navigate("Projects");
                    }}
                  >
                    Review project <ArrowRight size={14} />
                  </button>
                </div>
              ))
          ) : (
            <div className="calm-state">
              <span>
                <CheckCircle2 size={27} />
              </span>
              <h3>No reported issues</h3>
              <p>
                {connected
                  ? "Connected projects are ready to inspect."
                  : "Health checks begin when a project is connected."}
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="onboarding">
        <div className="onboarding-art">
          <Layers size={31} />
          <span className="orbit o1" />
          <span className="orbit o2" />
          <span className="mini-node n1">
            <Check size={12} />
          </span>
          <span className="mini-node n2">
            <Link2 size={12} />
          </span>
        </div>
        <div>
          <h2>Your first connection starts here.</h2>
          <p>
            Connect ReeloGram when its admin integration is ready.
            <br />
            Add future projects with the same secure connection standard.
          </p>
          <button className="text-button" onClick={() => navigate("Projects")}>
            Review connection setup <ArrowRight size={16} />
          </button>
        </div>
      </section>
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent activity</h2>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("Audit history")}
          >
            View history <ArrowRight size={15} />
          </button>
        </div>
        {data.audit.length ? (
          data.audit.slice(0, 4).map((a) => (
            <div className="activity-row" key={a.id}>
              <History size={16} />
              <div>
                <b>{a.action}</b>
                <small>
                  {a.projectId} · {a.actor}
                </small>
              </div>
              <span className="badge">{a.status}</span>
            </div>
          ))
        ) : (
          <div className="empty-inline">
            <History size={20} />
            <span>No activity yet. Your first action will appear here.</span>
          </div>
        )}
      </section>
    </>
  );
}
