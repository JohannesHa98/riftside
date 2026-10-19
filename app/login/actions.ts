"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signInWithPassword, signOut } from "@/lib/auth";

export type LoginState = { error: string } | null;

/** Slows down guessing without pretending to be real rate limiting. */
const WRONG_PASSWORD_DELAY_MS = 500;

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (password.length === 0) return { error: "Enter your password." };

  let signedIn = false;

  try {
    signedIn = await signInWithPassword(password);
  } catch (error) {
    // Missing AUTH_SECRET or ADMIN_PASSWORD_HASH. Keep the detail in the
    // server log rather than telling the whole internet how it is misconfigured.
    console.error("Sign-in is misconfigured:", error);
    return { error: "Sign-in is not set up yet." };
  }

  if (!signedIn) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return { error: "Wrong password." };
  }

  revalidatePath("/", "layout");
  redirect("/players");
}

export async function signOutAction(): Promise<void> {
  await signOut();

  revalidatePath("/", "layout");
  redirect("/");
}
