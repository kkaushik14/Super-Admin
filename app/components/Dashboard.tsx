"use client";
import Link from "next/link";
import packageInfo from "@/package.json";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Users,
  Clapperboard,
  Mail,
  Wrench,
  History,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  ChevronDown,
  ShieldCheck,
  X,
  Menu,
  LogOut,
  LockKeyhole,
} from "lucide-react";
import type { Snapshot, Project, Resource, Capability } from "@/lib/types";
import { Empty, statusLabel } from "./shared";
import OverviewView from "./views/OverviewView";
import ProjectsView from "./views/ProjectsView";
import AuditView from "./views/AuditView";
import CommandDialog, { type CommandSelection } from "./CommandDialog";
import CommandsView from "./views/CommandsView";
import { actionApplies, type AdminAction } from "@/lib/actions/contract";
import SettingsView from "./views/SettingsView";
const sections = [
  ["Overview", LayoutDashboard],
  ["Projects", Layers],
  ["Accounts", Users],
  ["Videos", Clapperboard],
  ["Email operations", Mail],
  ["Maintenance", Wrench],
  ["Audit history", History],
  ["Settings", Settings],
] as const;
export default function Dashboard({ initial }: { initial: Snapshot }) {
  const [data, setData] = useState(initial),
    [section, setSection] = useState("Overview"),
    [selected, setSelected] = useState(initial.projects[0]?.id || ""),
    [query, setQuery] = useState(""),
    [add, setAdd] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [menu, setMenu] = useState(false),
    [items, setItems] = useState<Resource[]>([]),
    [loading, setLoading] = useState(false),
    [resourceError, setResourceError] = useState(""),
    [action, setAction] = useState<{ action: string; target: string } | null>(
      null,
    );
  const [commandSelection, setCommandSelection] =
    useState<CommandSelection | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("command");
    if (id) {
      setCommandSelection({ id });
      history.replaceState(null, "", location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!add && !action) return;
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setAdd(false);
        setAction(null);
      }
      if (e.key === "Tab") {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button:not(:disabled), .modal input, .modal select, .modal textarea",
          ),
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [add, action, busy]);
  const current =
    data.projects.find((p) => p.id === selected) || data.projects[0];
  const connected = data.projects.filter(
    (p) => p.status === "connected",
  ).length;
  const needsAttention = data.projects.filter(
    (p) => p.status === "unreachable",
  ).length;
  const navigate = (s: string) => {
    setSection(s);
    setQuery("");
    setMenu(false);
  };
  async function refresh() {
    const r = await fetch("/api/control");
    if (!r.ok) {
      location.href = "/login";
      return;
    }
    setData(await r.json());
  }
  async function execute(body: Record<string, string>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      setError(false);
      setMessage(
        result.status === "accepted"
          ? "Action accepted. Check its status in the project."
          : result.status === "rejected"
            ? "The project rejected this action. Review the audit history."
            : "Changes saved successfully.",
      );
      await refresh();
      setAdd(false);
      setAction(null);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Request failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    setItems([]);
    setResourceError("");
    const resource =
      section === "Accounts"
        ? "accounts"
        : section === "Videos"
          ? "videos"
          : section === "Email operations"
            ? "jobs"
            : null;
    if (
      !resource ||
      current?.status !== "connected" ||
      !current.capabilities.includes((resource + ".read") as Capability)
    )
      return;
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/control?project=${encodeURIComponent(current.id)}&resource=${resource}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setItems(d.items);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setResourceError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [section, current?.id, current?.status, current?.capabilities]);
  const matches = (value: string) =>
    value.toLowerCase().includes(query.toLowerCase());
  function projectRow(p: Project) {
    return (
      <div className="project-row" key={p.id}>
        <div
          className={"project-icon " + (p.id === "reelogram" ? "violet" : "")}
        >
          {p.name.slice(0, 1)}
        </div>
        <div className="project-name">
          <strong>{p.name}</strong>
          <span>{new URL(p.origin).hostname}</span>
        </div>
        <span className="env">{p.environment}</span>
        <span className={"badge " + p.status}>
          <i />
          {statusLabel(p.status)}
        </span>
        <button
          className="icon-button"
          aria-label={"Manage " + p.name}
          onClick={() => {
            setSelected(p.id);
            navigate("Projects");
          }}
        >
          <ArrowUpRight size={18} />
        </button>
      </div>
    );
  }
  return (
    <div className="workspace">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          Super Admin
          <span className="brand-dot" />
        </Link>

        <button
          className="workspace-switch"
          onClick={() => navigate("Projects")}
        >
          <span className="workspace-avatar">
            {data.actor.charAt(0).toUpperCase()}
          </span>
          <span>
            <b>My workspace</b>
            <small>
              {data.projects.length} project
              {data.projects.length !== 1 ? "s" : ""}
            </small>
          </span>
          <ChevronDown size={16} />
        </button>

        <nav>
          {sections.slice(0, 6).map(([s, Icon]) => (
            <button
              key={s}
              className={section === s ? "active" : ""}
              onClick={() => navigate(s)}
            >
              <Icon size={18} />
              {s}
              {s === "Projects" && (
                <span className="nav-count">{data.projects.length}</span>
              )}
            </button>
          ))}
        </nav>

        <nav>
          {sections.slice(6).map(([s, Icon]) => (
            <button
              key={s}
              className={section === s ? "active" : ""}
              onClick={() => navigate(s)}
            >
              <Icon size={18} />
              {s}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note">
            <ShieldCheck size={18} />
            <div>
              <b>Private by design</b>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">{data.actor.charAt(0).toUpperCase()}</span>
            <div>
              <b>
                {data.preview ? "Local workspace" : data.actor.split("@")[0]}
              </b>
              <small>
                {data.preview ? "Read-only preview" : "Super administrator"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={data.preview ? "Sign in" : "Sign out"}
              onClick={async () => {
                if (!data.preview)
                  await signOut({ callbackUrl: "/login", redirect: false });
                location.href = "/login";
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{section}</b>
          </div>
          <div className="top-right">
            <span className="private-pill">
              <LockKeyhole size={12} />
              Private workspace
            </span>
            <span className="avatar small">
              {data.actor.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <h1>{section === "Overview" ? "Workspace overview" : section}</h1>
              <p>
                {section === "Overview"
                  ? "Keep your projects healthy and your next steps clear."
                  : section === "Projects"
                    ? "Connect your applications and manage what each one can do."
                    : section === "Audit history"
                      ? "A durable record of administrative changes across your projects."
                      : "Manage " +
                        section.toLowerCase() +
                        " across your connected projects."}
              </p>
            </div>
            <button className="primary" onClick={() => setAdd(true)}>
              <Plus size={17} />
              Add project
            </button>
          </div>
          {data.preview && (
            <div className="preview-notice">
              <ShieldCheck size={16} />
              <span>
                <b>You’re viewing the local workspace.</b> Sign in to connect
                projects and perform actions.
              </span>
              <Link href="/login">
                Admin sign-in <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {section === "Overview" ? (
            <OverviewView
              data={data}
              connected={connected}
              needsAttention={needsAttention}
              navigate={navigate}
              projectRow={projectRow}
              setAdd={setAdd}
              setSelected={setSelected}
            />
          ) : section === "Projects" ? (
            <ProjectsView
              data={data}
              query={query}
              setQuery={setQuery}
              matches={matches}
              execute={execute}
              busy={busy}
              setAction={setAction}
            />
          ) : section === "Audit history" ? (
            <>
              <CommandsView
                open={(id) => setCommandSelection({ id })}
                revision={data.audit}
              />
              <AuditView
                data={data}
                query={query}
                setQuery={setQuery}
                matches={matches}
                refresh={refresh}
              />
            </>
          ) : section === "Settings" ? (
            <SettingsView data={data} />
          ) : (
            <>
              <div className="toolbar">
                <label className="project-select">
                  Project{" "}
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.environment}
                      </option>
                    ))}
                  </select>
                </label>
                <span className={"badge " + current?.status}>
                  {current && statusLabel(current.status)}
                </span>
              </div>
              <section className="panel">
                {section === "Maintenance" ? (
                  <>
                    <div className="panel-heading">
                      <div>
                        <h2>Project maintenance</h2>
                        <p>
                          Actions use the project’s existing safeguards and job
                          ownership.
                        </p>
                      </div>
                    </div>
                    {[
                      [
                        "blocklist.refresh",
                        "Refresh email blocklist",
                        "Request a validated update of disposable email domains.",
                      ],
                      [
                        "jobs.retry",
                        "Retry a recorded job",
                        "Inspect eligible failed jobs from Email operations.",
                      ],
                    ].map(([c, title, desc]) => (
                      <div className="maintenance-row" key={c}>
                        <Wrench size={20} />
                        <div>
                          <h3>{title}</h3>
                          <p>{desc}</p>
                        </div>
                        <button
                          className="secondary"
                          disabled={true}
                          onClick={() =>
                            c === "jobs.retry"
                              ? navigate("Email operations")
                              : setAction({
                                  action: c,
                                  target: "disposable-email",
                                })
                          }
                        >
                          {c === "jobs.retry" ? "View jobs" : "Refresh"}
                        </button>
                      </div>
                    ))}
                  </>
                ) : loading ? (
                  <Empty
                    title="Loading project records…"
                    text="Waiting for the connected project."
                  />
                ) : resourceError ? (
                  <Empty title="Unable to load records" text={resourceError} />
                ) : !current ||
                  current.status !== "connected" ||
                  !current.capabilities.includes(
                    (section === "Accounts"
                      ? "accounts.read"
                      : section === "Videos"
                        ? "videos.read"
                        : "jobs.read") as Capability,
                  ) ? (
                  <Empty
                    title="Connect this capability to get started"
                    text={`${current?.name || "This project"} has not provided access to ${section.toLowerCase()} yet. Once connected, records and supported actions will appear here.`}
                  />
                ) : items.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Status</th>
                          <th>Available actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.label}</strong>
                              <small>{item.detail}</small>
                            </td>
                            <td>
                              <span className="badge">{item.status}</span>
                            </td>
                            <td>
                              <div className="row-actions">
                                {(data.availableActions?.[current.id] || [])
                                  .filter(
                                    (a) =>
                                      a.startsWith(
                                        section === "Accounts"
                                          ? "accounts."
                                          : section === "Videos"
                                            ? "videos."
                                            : "jobs.",
                                      ) &&
                                      actionApplies(a as AdminAction, item),
                                  )
                                  .map((a) => (
                                    <button
                                      key={a}
                                      className="secondary"
                                      disabled={data.preview || busy}
                                      onClick={() =>
                                        setCommandSelection({
                                          projectId: current.id,
                                          action: a as AdminAction,
                                          item,
                                        })
                                      }
                                    >
                                      {a.split(".")[1]}
                                    </button>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No records to show"
                    text="The connected project returned an empty list."
                  />
                )}
              </section>
            </>
          )}
          <footer className="footer">
            <span>
              <ShieldCheck size={13} /> Super Admin · v{packageInfo.version}
            </span>
            <span></span>
          </footer>
        </main>
      </div>
      {message && (
        <div role="status" className={"toast " + (error ? "toast-error" : "")}>
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {add && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close"
              onClick={() => setAdd(false)}
            >
              <X size={20} />
            </button>

            <h2 id="add-title">Add a project</h2>
            <p>
              Each project gets an independent, explicitly authorized
              connection.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(
                  new FormData(e.currentTarget),
                ) as Record<string, string>;
                execute({ ...f, action: "project.add" });
              }}
            >
              <label>
                Project name
                <input
                  required
                  name="name"
                  placeholder="My application"
                  maxLength={80}
                />
              </label>
              <label>
                Project ID
                <input
                  required
                  name="projectId"
                  placeholder="my-application"
                  pattern="[a-z][a-z0-9-]{1,39}"
                />
              </label>
              <label>
                Project URL
                <input
                  required
                  name="origin"
                  type="url"
                  placeholder="https://app.example.com"
                />
              </label>
              <label>
                Environment
                <select name="environment">
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="local">Local</option>
                </select>
              </label>
              {data.preview && (
                <p className="fine">
                  Sign in to enroll a project. Your server must allow its
                  hostname.
                </p>
              )}
              <button className="primary" disabled={data.preview || busy}>
                {busy ? "Adding…" : "Add project"}
                <Plus size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
      {commandSelection && (
        <CommandDialog
          selection={commandSelection}
          close={() => setCommandSelection(null)}
          changed={refresh}
        />
      )}
      {action && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-title"
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Cancel"
              onClick={() => setAction(null)}
            >
              <X size={20} />
            </button>
            <h2 id="action-title">Review action</h2>
            <p>
              <b>{action.action}</b> · {action.target}
            </p>
            <p>
              Project:{" "}
              {action.action === "project.disconnect"
                ? action.target
                : current?.name}
              . This action will be recorded in the audit history.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = String(
                  new FormData(e.currentTarget).get("reason") || "",
                );
                execute({
                  ...action,
                  projectId:
                    action.action === "project.disconnect"
                      ? action.target
                      : current.id,
                  reason,
                });
              }}
            >
              {action.action !== "project.disconnect" && (
                <label>
                  Reason
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={500}
                    placeholder="Explain why this action is needed…"
                  />
                </label>
              )}
              <button className="primary" disabled={busy || data.preview}>
                {busy ? "Submitting…" : "Confirm action"}
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
