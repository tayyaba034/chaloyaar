"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, GasPump, MapPin, NavigationArrow, WarningCircle } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import type { FuelType, Station } from "@/lib/station-data";
import { SpeakerButton } from "./speaker-button";
import { StationMap } from "./station-map";

type NearbyStation = Station & {
  distanceKm: number;
  distanceKind: "straight_line_approximate";
  availability: {
    state: "available" | "unavailable" | "queue_reported" | "unknown";
    source: "user" | "station" | "admin" | null;
    reportedAt: string | null;
  };

  officialPrice: {
    amount: number | null;
    currency: "PKR";
    source: string | null;
    effectiveAt: string | null;
  };

};

const areas = ["city-centre", "susan-road", "d-ground"] as const;
const fuelTypes = ["all", "petrol", "diesel", "cng"] as const;

type NearbyResponse = {
  stations: NearbyStation[];
  degraded?: boolean;
  degradedMessage?: string;
};

export function StationDiscovery() {
  const t = useTranslations("stations");
  const locale = useLocale();
  const [area, setArea] = useState<(typeof areas)[number]>("city-centre");
  const [fuel, setFuel] = useState<(typeof fuelTypes)[number]>("all");
  const [stations, setStations] = useState<NearbyStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [degradedMessage, setDegradedMessage] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ radiusKm: "15" });
    if (origin) {
      params.set("lat", String(origin.latitude));
      params.set("lng", String(origin.longitude));
    } else {
      params.set("areaId", area);
    }
    if (fuel !== "all") params.set("fuelType", fuel);

    void fetch(`/api/stations/nearby?${params}`, {
      signal: AbortSignal.timeout(12_000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("loadError"));
        return (await response.json()) as NearbyResponse;
      })
      .then((data) => {
        if (!active) return;
        setStations(data.stations);
        setDegradedMessage(data.degradedMessage ?? "");
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        console.error("Nearby stations could not be loaded", loadError);
        setError(t("loadError"));
        setStations([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [area, fuel, origin, reloadToken, t]);

  const visibleStations = useMemo(() => {
    if (fuel === "all") return stations;
    return stations.filter(
      (station) =>
        station.supportedFuels.length === 0 || station.supportedFuels.includes(fuel as FuelType),
    );
  }, [fuel, stations]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError(t("locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLoading(true);
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (locationError) => {
        console.error("Location permission or lookup failed", locationError);
        setError(t("locationDenied"));
      },
      { maximumAge: 60_000, timeout: 10_000 },
    );
  }

  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  return (
    <main className="cy-root cy-stations">
      <section className="cy-station-hero cy-container" aria-labelledby="stations-title">
        <div className="cy-station-hero-copy">
          <span className="cy-eyebrow"><MapPin weight="fill" aria-hidden="true" />{t("city")}</span>
          <h1 id="stations-title">{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="cy-station-hero-art" aria-hidden="true">
          <span className="cy-station-orbit cy-station-orbit--outer" />
          <span className="cy-station-orbit cy-station-orbit--inner" />
          <span className="cy-station-map-pin cy-station-map-pin--one"><GasPump weight="fill" /></span>
          <span className="cy-station-map-pin cy-station-map-pin--two"><GasPump weight="fill" /></span>
          <span className="cy-station-map-pin cy-station-map-pin--three"><GasPump weight="fill" /></span>
          <span className="cy-station-map-center"><MapPin weight="fill" /></span>
        </div>
        <div className="cy-station-hero-speak">
          <SpeakerButton text={`${t("title")}. ${t("subtitle")}`} phraseId="station-search" />
        </div>
      </section>

      <div className="cy-container cy-station-content">
        <section className="cy-station-search-panel" aria-label={t("areaLabel")}>
          <div className="cy-station-origin-icon" aria-hidden="true"><MapPin weight="fill" /></div>
          <div className="cy-station-area-field">
            <label htmlFor="area-select">{t("areaLabel")}</label>
            <select
              id="area-select"
              value={area}
              onChange={(event) => {
                setLoading(true);
                setArea(event.currentTarget.value as (typeof areas)[number]);
                setOrigin(null);
              }}
            >
              {areas.map((areaId) => (
                <option key={areaId} value={areaId}>{t(`areas.${areaId}`)}</option>
              ))}
            </select>
          </div>
          <span className="cy-station-search-divider" aria-hidden="true" />
          <button className="cy-button cy-button--accent cy-station-location-button" type="button" onClick={useMyLocation}>
            <NavigationArrow weight="fill" aria-hidden="true" />
            {t("useLocation")}
          </button>
        </section>

        <section className="cy-station-filters" aria-label={t("filtersTitle")}>
          <div className="cy-station-filter-heading">
            <span className="cy-station-section-icon" aria-hidden="true"><GasPump weight="fill" /></span>
            <div>
              <h2>{t("filtersTitle")}</h2>
              <p>{t("fuelFilter")}</p>
            </div>
          </div>
          <div className="cy-station-filter-row" role="group" aria-label={t("fuelFilter")}>
            {fuelTypes.map((fuelType) => (
              <button
                className={`cy-station-filter${fuel === fuelType ? " is-selected" : ""}`}
                type="button"
                key={fuelType}
                aria-pressed={fuel === fuelType}
                onClick={() => {
                  setLoading(true);
                  setFuel(fuelType);
                }}
              >
                {fuelType === "all" && <span className="cy-station-filter-dot" aria-hidden="true" />}
                {fuelType === "petrol" && <GasPump weight="fill" aria-hidden="true" />}
                {fuelType === "diesel" && <GasPump aria-hidden="true" />}
                {fuelType === "cng" && <span className="cy-station-cng-icon" aria-hidden="true">CNG</span>}
                {t(`fuels.${fuelType}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="cy-station-results" aria-live="polite">
          <div className="cy-station-results-heading">
            <div>
              <span className="cy-station-results-kicker">{t("city")}</span>
              <h2>{t("nearbyTitle")}</h2>
              <p>{t("resultCount", { count: visibleStations.length })}</p>
            </div>
            <SpeakerButton
              text={`${t("nearbyTitle")}. ${t("resultCount", { count: visibleStations.length })}`}
              phraseId="station-results"
            />
          </div>

          {error && (
            <p className="cy-station-alert" role="status">
              <WarningCircle weight="fill" aria-hidden="true" />
              <span>{error}</span>
              <button type="button" onClick={() => {
                setLoading(true);
                setReloadToken((current) => current + 1);
              }}>
                {t("retry")}
              </button>
            </p>
          )}
          {loading ? (
            <div className="cy-station-list" aria-label={t("loading")} aria-busy="true">
              {[0, 1, 2].map((index) => <div className="cy-station-skeleton" key={index} />)}
            </div>
          ) : visibleStations.length ? (
            <>
              {degradedMessage && <p className="cy-station-alert" role="status">{degradedMessage}</p>}
              <StationMap
                center={origin ?? { latitude: 31.4181, longitude: 73.0791 }}
                userLocation={origin}
                markers={visibleStations.map((station) => ({
                  name: station.name,
                  address: station.address,
                  latitude: station.latitude,
                  longitude: station.longitude,
                }))}
              />
              <div className="cy-station-list">
              {visibleStations.map((station) => {
                const distance = formatter.format(station.distanceKm);
              const price = station.officialPrice.amount === null
                ? t("unknownPrice")
                : `${station.officialPrice.currency} ${formatter.format(station.officialPrice.amount)} per litre`;
              const availability = station.availability.state === "unknown"
                ? t("unknownStatus")
                : station.availability.state === "available"
                  ? "Available"
                  : station.availability.state === "unavailable"
                    ? "Unavailable"
                    : "Queue reported";
              const spoken = `${station.name}. ${availability}. ${price}. ${t("approxDistance", { distance })}`;
                return (
                  <article className="cy-station-card" key={station.id}>
                    <div className="cy-station-card-mark" aria-hidden="true"><GasPump weight="fill" /></div>
                    <div className="cy-station-card-body">
                      <div className="cy-station-card-heading">
                        <div className="cy-station-card-name">
                          <h3><Link href={`/app/stations/${station.id}`}>{station.name}</Link></h3>
                          {station.address && <p>{station.address}</p>}
                        </div>
                        <SpeakerButton text={spoken} phraseId={`station-${station.id}`} />
                      </div>
                      <div className="cy-station-badges">
                        {station.isDemo && <span className="cy-station-badge cy-station-badge--demo">{t("demo")}</span>}
                        <span className={`cy-station-badge cy-station-badge--${station.availability.state}`}><span className="cy-station-badge-dot" />{availability}</span>
                        <span className="cy-station-badge">{t("unverified")}</span>
                      </div>
                      <div className="cy-station-facts">
                        <span><NavigationArrow aria-hidden="true" />{t("approxDistance", { distance })}</span>
                        <span><span className="cy-station-price-symbol" aria-hidden="true">₨</span>{price}</span>
                      </div>
                      <p className="cy-station-source">
                        {station.officialPrice.source
                          ? `Official price: ${station.officialPrice.source}`
                          : t("sourceLabel", { source: station.source })}
                        {station.updatedAt
                          ? ` · ${t("updatedAt", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(station.updatedAt)) })}`
                          : ""}
                        {station.sourceUrl && (
                          <>
                            {" · "}
                            <a href={station.sourceUrl} target="_blank" rel="noreferrer">{t("sourceDetails")}</a>
                          </>
                        )}
                      </p>
                      <div className="cy-station-card-actions">
                        <a
                          className="cy-button cy-button--outline"
                          href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("directions")}<ArrowUpRight aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
              </div>
            </>
          ) : (
            <>
              <StationMap center={origin ?? { latitude: 31.4181, longitude: 73.0791 }} userLocation={origin} markers={[]} />
              <div className="cy-station-empty">
                <span className="cy-station-empty-icon" aria-hidden="true"><GasPump weight="fill" /></span>
                <h3>{t("emptyTitle")}</h3>
                <p>{t("emptyMessage")}</p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
