"use client";
import { useEffect, useRef, useState } from "react";
import { googleVerificationParameters } from "@/lib/actions/google-verification";
import { signIn } from "next-auth/react";
import { X } from "lucide-react";
import type { Resource } from "@/lib/types";
import type { AdminAction } from "@/lib/actions/contract";
export type CommandSummary = {
  id: string;
  projectId: string;
  action: AdminAction;
  target: string;
  label: string;
  reason: string;
  expectedRevision: number;
  state: string;
  attempts: number;
  retryBlocked: boolean;
  receipt?: { code: string; revision: number | null };
};
export type CommandSelection =
  { id: string } | { projectId: string; action: AdminAction; item: Resource };
export const actionLabels: Record<AdminAction, string> = {
  "accounts.suspend": "Suspend account",
  "accounts.restore": "Restore account",
  "videos.hide": "Hide video",
  "videos.restore": "Restore video",
};
const consequences: Record<AdminAction, string> = {
  "accounts.suspend":
    "Blocks sign-in and publishing and invalidates existing sessions. Published videos remain visible.",
  "accounts.restore":
    "Allows the account to sign in again. Existing verification restrictions still apply; old sessions remain invalid.",
  "videos.hide":
    "Removes this video from public pages and feeds. Anyone with its direct media URL can still access the file.",
  "videos.restore":
    "Removes the visibility restriction. Archived videos remain archived; videos pending deletion cannot be restored.",
};
export default function CommandDialog({
  selection,
  close,
  changed,
}: {
  selection: CommandSelection;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [command, setCommand] = useState<CommandSummary | null>(null),
    [fresh, setFresh] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)",
          ) || [],
        );
        const first = items[0],
          last = items.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!("id" in selection)) return;
    const abort = new AbortController();
    setBusy(true);
    fetch("/api/actions?id=" + encodeURIComponent(selection.id), {
      signal: abort.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setCommand(d.command);
        setFresh(d.fresh);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setBusy(false));
    return () => abort.abort();
  }, [selection]);
  async function perform(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      const r = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setCommand(d.command);
      setFresh(d.fresh);
      await changed();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Request failed") +
          ". If a request was interrupted, reopen the saved command from Audit history.",
      );
    } finally {
      setBusy(false);
    }
  }
  const action =
    command?.action || ("action" in selection ? selection.action : null);
  const unresolved = command && ["pending", "unknown"].includes(command.state);
  const canSend =
    command &&
    (command.state === "prepared" ||
      (unresolved && !command.retryBlocked && command.attempts < 3));
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        tabIndex={-1}
        className="modal command-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-title"
      >
        <button
          className="icon-button modal-close"
          aria-label="Close command"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
        <h2 id="command-title">
          {action ? actionLabels[action] : "Review command"}
        </h2>
        {action && <p>{consequences[action]}</p>}
        {error && (
          <p role="alert" className="command-error">
            {error}
          </p>
        )}
        {!command && "item" in selection && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(
                new FormData(e.currentTarget).get("reason") || "",
              );
              void perform({
                mode: "prepare",
                projectId: selection.projectId,
                action: selection.action,
                target: selection.item.id,
                expectedRevision: selection.item.revision,
                reason,
              });
            }}
          >
            <p>
              <strong>{selection.item.label}</strong>
              <br />
              <code>{selection.item.id}</code>
            </p>
            <label>
              Reason
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={500}
                disabled={busy}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Checking record…" : "Review command"}
            </button>
          </form>
        )}
        {command && (
          <>
            <dl className="command-details">
              <dt>Project</dt>
              <dd>{command.projectId}</dd>
              <dt>Record</dt>
              <dd>
                {command.label}
                <br />
                <code>{command.target}</code>
              </dd>
              <dt>Reason</dt>
              <dd>{command.reason}</dd>
              <dt>Reviewed revision</dt>
              <dd>{command.expectedRevision}</dd>
              <dt>Status</dt>
              <dd>
                {command.state}
                {command.receipt
                  ? " · " + command.receipt.code.replaceAll("-", " ")
                  : ""}
              </dd>
              <dt>Command</dt>
              <dd>
                <code>{command.id}</code>
              </dd>
            </dl>
            {command.receipt?.code === "stale-revision" && (
              <p>
                The record changed. Close this dialog, refresh the list and
                review the current record before preparing a new command.
              </p>
            )}
            {unresolved && (
              <p>
                The outcome is unconfirmed. Check the receipt first. Retrying
                preserves this command’s original intent and ID.
              </p>
            )}
            {command.retryBlocked && (
              <p role="alert">
                The project reported a command identity conflict. Retry is
                blocked; investigate this command.
              </p>
            )}
            {canSend && (
              <>
                {!fresh && (
                  <p>
                    A recent Google authentication is required. Account
                    selection alone may not renew Google’s authentication time.
                  </p>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void signIn(
                      "google",
                      { callbackUrl: "/?command=" + command.id },
                      googleVerificationParameters,
                    )
                  }
                >
                  Verify with Google
                </button>
                <label className="command-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I confirm this action on this exact record.
                </label>
              </>
            )}
            <div className="row-actions command-buttons">
              {unresolved && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform({ mode: "reconcile", id: command.id })
                  }
                >
                  Check receipt
                </button>
              )}
              {canSend && (
                <button
                  className="primary"
                  disabled={busy || !fresh || !confirmed}
                  onClick={() =>
                    void perform({
                      mode: command.state === "prepared" ? "dispatch" : "retry",
                      id: command.id,
                      confirmed: true,
                    })
                  }
                >
                  {busy
                    ? "Checking…"
                    : unresolved
                      ? "Retry same command"
                      : "Confirm action"}
                </button>
              )}
              {command.state === "prepared" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform({ mode: "cancel", id: command.id })
                  }
                >
                  Cancel draft
                </button>
              )}
            </div>
          </>
        )}
        {busy && <p role="status">Checking command…</p>}
      </div>
    </div>
  );
}
