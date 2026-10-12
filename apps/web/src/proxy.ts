import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { isAppLocale, routing } from "./i18n/routing";
import { isAppRole, resolveRoleAccess, type AuthProfile } from "./lib/role-access";
import { getSupabaseConfig } from "./lib/supabase-config";

const internationalize = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = internationalize(request);
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const locale = segments[0];
  if (!locale || !isAppLocale(locale)) return response;

  const pathname = `/${segments.slice(1).join("/")}`;
  const protectedArea = /^\/(app|provider|station-admin|admin)(?:\/|$)/.test(pathname);
  const guestStationBrowse = /^\/app\/stations(?:\/[^/]+)?$/.test(pathname);
  if (!protectedArea || guestStationBrowse) return response;

  const { url, key } = getSupabaseConfig();
  let profile: AuthProfile | null = null;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError && authError.message !== "Auth session missing!") {
      console.error("Middleware session lookup failed", authError.message);
    } else if (authData.user) {
      const { data: row, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, display_name")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Middleware profile lookup failed", profileError.message);
      } else if (row && isAppRole(row.role)) {
        let verificationStatus: AuthProfile["verificationStatus"] = null;
        if (row.role === "provider" || row.role === "station_admin") {
          const verificationTable = row.role === "provider" ? "providers" : "station_admins";
          const { data: account, error: accountError } = await supabase
            .from(verificationTable)
            .select("verification_status")
            .eq("id", authData.user.id)
            .maybeSingle();
          if (accountError) {
            console.error("Middleware role status lookup failed", accountError.message);
          } else {
            verificationStatus =
              account?.verification_status === "approved" ||
              account?.verification_status === "suspended"
                ? account.verification_status
                : "pending";
          }
        }
        profile = {
          id: authData.user.id,
          role: row.role,
          displayName: row.display_name,
          verificationStatus,
        };
      }
    }
  }

  const decision = resolveRoleAccess(pathname, profile);
  if (decision.allowed) return response;
  return NextResponse.redirect(new URL(`/${locale}${decision.redirectPath}`, request.url));
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
