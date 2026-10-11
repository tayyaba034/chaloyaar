export type AppRole = "driver" | "provider" | "station_admin" | "admin";
export type ProviderVerification = "pending" | "approved" | "suspended";
export type StationAdminVerification = ProviderVerification;

export type AuthProfile = {
  id: string;
  role: AppRole;
  displayName: string | null;
  verificationStatus: ProviderVerification | null;
};

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; redirectPath: string };

export function isAppRole(value: unknown): value is AppRole {
  return value === "driver" || value === "provider" || value === "station_admin" || value === "admin";
}

export function roleHome(role: AppRole) {
  if (role === "provider") return "/provider";
  if (role === "station_admin") return "/station-admin";
  if (role === "admin") return "/admin";
  return "/app";
}

export function resolveRoleAccess(
  pathname: string,
  profile: AuthProfile | null,
): AccessDecision {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (/^\/app\/stations(?:\/[^/]+)?$/.test(normalized)) {
    return { allowed: true };
  }

  const area = normalized.split("/")[1];
  if (area !== "app" && area !== "provider" && area !== "station-admin" && area !== "admin") {
    return { allowed: true };
  }

  if (!profile) {
    return {
      allowed: false,
      redirectPath: `/auth/sign-in?next=${encodeURIComponent(normalized)}`,
    };
  }

  const requiredRole = area === "app" ? "driver" : area === "station-admin" ? "station_admin" : area;
  if (requiredRole !== profile.role) {
    return { allowed: false, redirectPath: roleHome(profile.role) };
  }

  if (
    profile.role === "provider" &&
    profile.verificationStatus !== "approved" &&
    normalized !== "/provider"
  ) {
    return { allowed: false, redirectPath: "/provider" };
  }

  return { allowed: true };
}
