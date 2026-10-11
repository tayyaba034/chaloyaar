"use client";
import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { useRouter } from "@/i18n/navigation";
import { saveLanguageChoice } from "@/app/actions";
import { driverMutation, useDriverResource } from "./use-driver-resource";
type Profile = {
  display_name: string | null;
  email: string;
  phone: string;
  preferred_language: AppLocale;
  is_demo: boolean;
  driver_auto_read: boolean;
  driver_notifications: boolean;
  driver_reduced_motion: boolean;
};
export function DriverProfile({ settings = false }: { settings?: boolean }) {
  const { data, loading, error, refresh } = useDriverResource<{
    profile: Profile;
  }>("/api/driver/profile");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const [preferences, setPreferences] = useState<
    Partial<
      Record<
        "driver_auto_read" | "driver_notifications" | "driver_reduced_motion",
        boolean
      >
    >
  >({});
  const locale = useLocale() as AppLocale,
    languageT = useTranslations("language"),
    router = useRouter();
  async function save(body: unknown) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await driverMutation("/api/driver/profile", "PATCH", body);
      window.dispatchEvent(new Event("driver-profile-updated"));
      refresh();
      setMessage("Your account changes were saved.");
      return true;
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error ? e.message : "Changes could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const profile = data?.profile;
  return (
    <main className="dashboard-page">
      <div className="driver-page-heading">
        <div>
          <h1>{settings ? "Settings" : "Profile"}</h1>
          <p>
            {settings
              ? "Language and accessibility preferences for your account."
              : "Your signed-in Driver account."}
          </p>
        </div>
      </div>
      {error && (
        <p className="driver-message driver-error" role="alert">
          {error}
          <button className="driver-secondary" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {message && (
        <p
          className={`driver-message${failed ? " driver-error" : ""}`}
          role="status"
        >
          {message}
        </p>
      )}
      {loading && !profile ? (
        <div className="driver-loading" role="status">
          Loading account...
        </div>
      ) : (
        profile && (
          <>
            <section className="driver-profile-identity">
              <span className="driver-avatar">
                {(profile.display_name || "Driver").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{profile.display_name || "Driver"}</h2>
                <p>{profile.email || profile.phone}</p>
                <span className="driver-small">
                  Driver account{profile.is_demo ? " / Demo test account" : ""}
                </span>
              </div>
            </section>
            {!settings && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await save({ displayName: form.get("name") });
                }}
                key={profile.display_name}
              >
                <h2>Personal details</h2>
                <div className="driver-form-grid">
                  <label>
                    Saved name
                    <input
                      name="name"
                      required
                      maxLength={60}
                      defaultValue={profile.display_name ?? ""}
                    />
                  </label>
                  <label>
                    Email
                    <input value={profile.email} readOnly />
                  </label>
                  <label>
                    Phone
                    <input value={profile.phone || "Not provided"} readOnly />
                  </label>
                  <label>
                    Account role
                    <input value="Driver" readOnly />
                  </label>
                </div>
                <button
                  type="submit"
                  className="driver-primary"
                  disabled={busy}
                >
                  <Check />
                  {busy ? "Saving..." : "Save profile"}
                </button>
              </form>
            )}
            {settings && (
              <section className="driver-section">
                <label className="driver-field">
                  {languageT("change")}
                  <select
                    value={locale}
                    disabled={busy}
                    onChange={async (event) => {
                      const next = event.target.value as AppLocale;
                      if (await save({ language: next })) {
                        await saveLanguageChoice(next);
                        router.replace("/app/settings", { locale: next });
                        router.refresh();
                      }
                    }}
                  >
                    {routing.locales.map((value) => (
                      <option key={value} value={value}>
                        {languageT(`names.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    {
                      key: "driver_auto_read",
                      label: "Read screens aloud",
                      description:
                        "Uses supported audio or a matching browser voice. You can also use each screen's speaker button.",
                    },
                    {
                      key: "driver_notifications",
                      label: "In-app request updates",
                      description:
                        "The notification bell shows your recent request statuses and refreshes while open. No emails or push notifications are sent.",
                    },
                    {
                      key: "driver_reduced_motion",
                      label: "Reduce motion",
                      description:
                        "Minimise transitions in your Driver account.",
                    },
                  ] as const
                ).map(({ key, label, description }) => (
                  <label className="driver-preference" key={key}>
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={preferences[key] ?? profile[key]}
                      onChange={async (event) => {
                        const next = event.target.checked;
                        const previous = preferences[key] ?? profile[key];
                        setPreferences((values) => ({
                          ...values,
                          [key]: next,
                        }));
                        if (!(await save({ [key]: next })))
                          setPreferences((values) => ({
                            ...values,
                            [key]: previous,
                          }));
                      }}
                    />
                  </label>
                ))}
              </section>
            )}
          </>
        )
      )}
    </main>
  );
}
