"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function saveLanguageChoice(locale: string) {
  if (!isAppLocale(locale)) {
    throw new Error("Unsupported language selection.");
  }

  const cookieStore = await cookies();
  cookieStore.set("chalo-language-picked", "1", {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  cookieStore.set("NEXT_LOCALE", locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function saveAutoReadPreference(enabled: boolean) {
  if (typeof enabled !== "boolean") {
    throw new Error("Auto-read preference must be a boolean.");
  }

  const cookieStore = await cookies();
  cookieStore.set("chalo-auto-read", String(enabled), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function signOutAction(locale: string) {
  if (!isAppLocale(locale)) {
    throw new Error("Unsupported language selection.");
  }
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out failed", error.message);
      throw new Error("Sign out could not be completed.");
    }
  }
  redirect(`/${locale}/auth/sign-in`);
}
