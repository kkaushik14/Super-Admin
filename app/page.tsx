import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actor, preview } from "@/lib/auth";
import { projects, history } from "@/lib/store";
import Dashboard from "@/app/components/Dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const who = actor((await cookies()).get("admin_session")?.value);
  if (!who && !preview()) redirect("/login");
  return (
    <Dashboard
      initial={{
        projects: projects(),
        audit: history(),
        preview: !who,
        actor: who || "Local preview",
      }}
    />
  );
}
