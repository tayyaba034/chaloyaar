import { describe, expect, it } from "vitest";
import { resolveRoleAccess, type AuthProfile } from "./role-access";

const driver: AuthProfile = {
  id: "driver-id",
  role: "driver",
  displayName: null,
  verificationStatus: null,
};
const pendingProvider: AuthProfile = {
  id: "provider-id",
  role: "provider",
  displayName: null,
  verificationStatus: "pending",
};
const approvedProvider: AuthProfile = {
  ...pendingProvider,
  verificationStatus: "approved",
};
const admin: AuthProfile = {
  id: "admin-id",
  role: "admin",
  displayName: null,
  verificationStatus: null,
};

describe("resolveRoleAccess", () => {
  it("redirects logged-out users to sign in with a return path", () => {
    expect(resolveRoleAccess("/app/help/new", null)).toEqual({
      allowed: false,
      redirectPath: "/auth/sign-in?next=%2Fapp%2Fhelp%2Fnew",
    });
  });

  it("redirects a driver away from provider and admin routes", () => {
    expect(resolveRoleAccess("/provider/requests", driver)).toEqual({
      allowed: false,
      redirectPath: "/app",
    });
    expect(resolveRoleAccess("/admin", driver)).toEqual({
      allowed: false,
      redirectPath: "/app",
    });
  });

  it("lets guests browse station list and detail, but not report actions", () => {
    expect(resolveRoleAccess("/app/stations", null)).toEqual({ allowed: true });
    expect(resolveRoleAccess("/app/stations/station-1", null)).toEqual({ allowed: true });
    expect(resolveRoleAccess("/app/stations/station-1/report", null)).toEqual({
      allowed: false,
      redirectPath: "/auth/sign-in?next=%2Fapp%2Fstations%2Fstation-1%2Freport",
    });
  });

  it("keeps pending and suspended providers out of every provider child route", () => {
    expect(resolveRoleAccess("/provider", pendingProvider)).toEqual({ allowed: true });
    expect(resolveRoleAccess("/provider/requests", pendingProvider)).toEqual({
      allowed: false,
      redirectPath: "/provider",
    });
    expect(
      resolveRoleAccess("/provider/services", {
        ...pendingProvider,
        verificationStatus: "suspended",
      }),
    ).toEqual({ allowed: false, redirectPath: "/provider" });
    expect(resolveRoleAccess("/provider/requests", approvedProvider)).toEqual({
      allowed: true,
    });
  });

  it("redirects signed-in users to the area for their role", () => {
    expect(resolveRoleAccess("/admin", approvedProvider)).toEqual({
      allowed: false,
      redirectPath: "/provider",
    });
    expect(resolveRoleAccess("/app", admin)).toEqual({
      allowed: false,
      redirectPath: "/admin",
    });
  });
});
