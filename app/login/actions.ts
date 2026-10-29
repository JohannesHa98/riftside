"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  clearLoginFailures,
  countRecentLoginFailures,
  recordLoginFailure,
} from "@/db/queries";
import { signInWithPassword, signOut } from "@/lib/auth";
import {
  ATTEMPT_WINDOW_MINUTES,
  addressKey,
  clientAddress,
  isLockedOut,
} from "@/lib/login-throttle";

export type LoginState = { error: string } | null;

/** Slows down guessing without pretending to be real rate limiting. */
const WRONG_PASSWORD_DELAY_MS = 500;

/**
 * Which address is guessing, hashed. Falls back to one shared bucket when
 * there is no secret to salt with, which throttles harder rather than less.
 */
async function guesser(): Promise<string> {
  const headerList = await headers();
  const address = clientAddress(headerList.get("x-forwarded-for"));

  return addressKey(address, process.env.AUTH_SECRET ?? "");
}

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (password.length === 0) return { error: "Enter your password." };

  const address = await guesser();

  // Checked before the password is looked at, so a locked-out address cannot
  // keep testing guesses and read the answer from how long the reply takes.
  if (isLockedOut(await countRecentLoginFailures(address))) {
    return {
      error: `Too many wrong attempts. Try again in ${ATTEMPT_WINDOW_MINUTES} minutes.`,
    };
  }

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
    await recordLoginFailure(address);
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return { error: "Wrong password." };
  }

  // One right answer wipes the slate, so a lockout never outlives the person
  // who actually knows the password.
  await clearLoginFailures(address);

  revalidatePath("/", "layout");
  redirect("/players");
}

export async function signOutAction(): Promise<void> {
  await signOut();

  revalidatePath("/", "layout");
  redirect("/");
}
