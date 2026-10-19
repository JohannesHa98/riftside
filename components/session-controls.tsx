import Link from "next/link";

import { signOutAction } from "@/app/login/actions";
import { isSignedIn } from "@/lib/auth";

/**
 * Rendered on the server inside the nav's Suspense boundary, so reading the
 * session cookie does not make the whole shell dynamic.
 */
export async function SessionControls() {
  if (await isSignedIn()) {
    return (
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-ink-dim transition-colors hover:bg-raised/60 hover:text-ink"
        >
          Sign out
        </button>
      </form>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-ink-dim transition-colors hover:bg-raised/60 hover:text-ink"
    >
      Sign in
    </Link>
  );
}
