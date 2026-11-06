import {
  authConfigured,
  googleConfigured,
  devLoginEnabled,
} from "@/lib/config/environment";
import LoginForm from "@/app/components/LoginForm";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const failed = Boolean((await searchParams).error);
  return (
    <LoginForm
      failed={failed}
      google={authConfigured() && googleConfigured()}
      development={authConfigured() && devLoginEnabled()}
    />
  );
}
