import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui";
import { isSignedIn } from "@/lib/auth";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div>
      <PageHeader
        title="Sign in"
        description="Anyone can look. Only you can change things."
      />

      <Suspense fallback={<div className="h-40" aria-hidden />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  if (await isSignedIn()) redirect("/players");

  return <LoginForm />;
}
