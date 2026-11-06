import { redirect } from "next/navigation";
import { actor } from "@/lib/auth";
import { projects, history } from "@/lib/store";
import Dashboard from "@/app/components/Dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const who = await actor();
  if (!who) redirect("/login");
  const [registered, audit] = await Promise.all([projects(), history()]);
  return (
    <Dashboard
      initial={{ projects: registered, audit, preview: false, actor: who }}
    />
  );
}
