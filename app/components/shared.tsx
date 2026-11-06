import { Link2 } from "lucide-react";
export const statusLabel = (s: string) =>
  s === "not-connected"
    ? "Not connected"
    : s.charAt(0).toUpperCase() + s.slice(1);
export function Stat({
  icon,
  label,
  value,
  note,
  green = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note?: string;
  green?: boolean;
}) {
  return (
    <section className="stat">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      {note && (
        <small>
          {green && <i />}
          {note}
        </small>
      )}
    </section>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>
        <Link2 size={26} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
