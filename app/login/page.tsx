import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui";
import { isSignedIn } from "@/lib/auth";

import { LoginForm } from "./login-form";

// Nothing links here, so keep it out of search results too.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div>
      <PageHeader title="Sign in" />

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
