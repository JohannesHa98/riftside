"use client";

import { useActionState } from "react";

import { buttonStyles, inputStyles } from "@/components/ui";

import { signInAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, null);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-dim uppercase">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className={inputStyles}
        />
      </label>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad"
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonStyles.primary}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
