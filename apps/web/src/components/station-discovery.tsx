"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUpRight,
  GasPump,
  MapPin,
  NavigationArrow,
  WarningCircle,
} from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import type { FuelType, Station } from "@/lib/station-data";
import { SpeakerButton } from "./speaker-button";
import { StationMap } from "./station-map";
import { StationInformation, type DiscoveryAvailability } from "./station-information";
import { stationAreas } from "@/lib/station-search";
import { isVerifiedStation, matchesDiscoveryFuel } from "@/lib/station-discovery-facts";
import { AssistantPanel } from "./assistant-panel";

type NearbyStation = Station & {
  distanceKm: number;
  distanceKind: "straight_line_approximate";
  availability: DiscoveryAvailability;
};

const areas = ["city-centre", "susan-road", "d-ground"] as const;
const fuelTypes = ["all", "petrol", "diesel", "cng"] as const;

type NearbyResponse = {
  stations: NearbyStation[];
  radiusKm: number;
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
  const [origin, setOrigin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [manualArea, setManualArea] = useState("");
  const [radiusKm, setRadiusKm] = useState(15);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;
    let cancelled = false;
    const controller = new AbortController();

    async function loadNearby(radiusKm: number): Promise<NearbyResponse> {
      const response = await fetch("/api/stations/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radiusKm, ...(origin ? { lat: origin.latitude, lng: origin.longitude } : { areaId: area }), ...(fuel !== "all" ? { fuelType: fuel } : {}) }),
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      });
      if (!response.ok) throw new Error(t("loadError"));
      return (await response.json()) as NearbyResponse;
    }

    async function run() {
      try {
        for (const radiusKm of [15, 30]) {
          const data = await loadNearby(radiusKm);
          if (!active || cancelled) return;

          if (data.stations.length > 0 || radiusKm >= 30) {
            setStations(data.stations);
            setRadiusKm(data.radiusKm);
            setError("");
            return;
          }
        }
        if (!active || cancelled) return;
        setStations([]);
        setError("");
      } catch (loadError: unknown) {
        if (!active || cancelled) return;
        void loadError;
        setError(t("loadError"));
        setStations([]);
      } finally {
        if (active && !cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      active = false;
      cancelled = true;
      controller.abort();
    };
  }, [area, fuel, origin, reloadToken, t]);

  const visibleStations = useMemo(() => {
    return stations.filter(
      (station) =>
        matchesDiscoveryFuel(station, fuel === "all" ? null : fuel as FuelType) &&
        `${station.name} ${station.address ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    );
  }, [fuel, stations, search]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError(t("locationUnavailable"));
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLoading(true);
        setLocating(false);
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setError(t("locationDenied"));
      },
      { maximumAge: 60_000, timeout: 10_000 },
    );
  }

  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  return (
    <main className="cy-root cy-stations">
      <section
        className="cy-station-hero cy-container"
        aria-labelledby="stations-title"
      >
        <div className="cy-station-hero-copy">
          <span className="cy-eyebrow">
            <MapPin weight="fill" aria-hidden="true" />
            {t("city")}
          </span>
          <h1 id="stations-title">{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="cy-station-hero-art" aria-hidden="true">
          <span className="cy-station-orbit cy-station-orbit--outer" />
          <span className="cy-station-orbit cy-station-orbit--inner" />
          <span className="cy-station-map-pin cy-station-map-pin--one">
            <GasPump weight="fill" />
          </span>
          <span className="cy-station-map-pin cy-station-map-pin--two">
            <GasPump weight="fill" />
          </span>
          <span className="cy-station-map-pin cy-station-map-pin--three">
            <GasPump weight="fill" />
          </span>
          <span className="cy-station-map-center">
            <MapPin weight="fill" />
          </span>
        </div>
        <div className="cy-station-hero-speak">
          <SpeakerButton
            text={`${t("title")}. ${t("subtitle")}`}
            phraseId="station-search"
          />
        </div>
      </section>

      <div className="cy-container cy-station-content">
        <AssistantPanel origin={origin} />
        <form
          className="driver-actions driver-area-search"
          onSubmit={(event) => {
            event.preventDefault();
            const normaliseArea = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s-]+/g, "");
            const match = areas.find(
              (id) =>
                normaliseArea(t(`areas.${id}`)) === normaliseArea(manualArea) ||
                normaliseArea(id) === normaliseArea(manualArea),
            );
            if (!match) {
              setError(
                t("discovery.areaHint"),
              );
              return;
            }
            setLoading(true);
            setError("");
            setArea(match);
            setOrigin(null);
            setReloadToken((token) => token + 1);
          }}
        >
          <label className="driver-field">
            {t("discovery.enterArea")}
            <input
              value={manualArea}
              onChange={(event) => setManualArea(event.target.value)}
              list="driver-known-areas"
              required
            />
            <datalist id="driver-known-areas">
              {areas.map((id) => (
                <option key={id} value={t(`areas.${id}`)} />
              ))}
            </datalist>
          </label>
          <button className="driver-secondary" type="submit">
            <MapPin />
            {t("discovery.searchArea")}
          </button>
        </form>
        <p className="driver-small">{t("discovery.areaHint")}</p>
        <p className="driver-small">{t("discovery.locationPrivacy")}</p>
        <section
          className="cy-station-search-panel"
          aria-label={t("areaLabel")}
        >
          <div className="cy-station-origin-icon" aria-hidden="true">
            <MapPin weight="fill" />
          </div>
          <div className="cy-station-area-field">
            <label htmlFor="area-select">{t("areaLabel")}</label>
            <select
              id="area-select"
              value={area}
              onChange={(event) => {
                setLoading(true);
                setArea(event.currentTarget.value as (typeof areas)[number]);
                setOrigin(null);
                setReloadToken((token) => token + 1);
              }}
            >
              {areas.map((areaId) => (
                <option key={areaId} value={areaId}>
                  {t(`areas.${areaId}`)}
                </option>
              ))}
            </select>
          </div>
          <span className="cy-station-search-divider" aria-hidden="true" />
          <button
            className="cy-button cy-button--accent cy-station-location-button"
            type="button"
            onClick={useMyLocation}
            disabled={locating}
          >
            <NavigationArrow weight="fill" aria-hidden="true" />
            {locating ? t("discovery.locating") : t("useLocation")}
          </button>
        </section>

        <section className="cy-station-filters" aria-label={t("filtersTitle")}>
          <label className="driver-field">
            {t("discovery.stationSearch")}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("discovery.stationSearchHint")}
            />
          </label>
          <div className="cy-station-filter-heading">
            <span className="cy-station-section-icon" aria-hidden="true">
              <GasPump weight="fill" />
            </span>
            <div>
              <h2>{t("filtersTitle")}</h2>
              <p>{t("fuelFilter")}</p>
            </div>
          </div>
          <div
            className="cy-station-filter-row"
            role="group"
            aria-label={t("fuelFilter")}
          >
            {fuelTypes.map((fuelType) => (
              <button
                className={`cy-station-filter${fuel === fuelType ? " is-selected" : ""}`}
                type="button"
                key={fuelType}
                aria-pressed={fuel === fuelType}
                onClick={() => {
                  setLoading(true);
                  setFuel(fuelType);
                  setReloadToken((token) => token + 1);
                }}
              >
                {fuelType === "all" && (
                  <span className="cy-station-filter-dot" aria-hidden="true" />
                )}
                {fuelType === "petrol" && (
                  <GasPump weight="fill" aria-hidden="true" />
                )}
                {fuelType === "diesel" && <GasPump aria-hidden="true" />}
                {fuelType === "cng" && (
                  <span className="cy-station-cng-icon" aria-hidden="true">
                    CNG
                  </span>
                )}
                {t(`fuels.${fuelType}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="cy-station-results" aria-live="polite">
          {!loading && !error && !visibleStations.some(station => isVerifiedStation(station)) && (
            <div className="cy-station-empty" role="status">
              <h3>{t("discovery.noVerifiedTitle")}</h3>
              <p>{t("discovery.noVerifiedMessage")}</p>
            </div>
          )}
          {fuel === "all" && (
            <p className="driver-small">
              {t("discovery.petrolReports")}
            </p>
          )}
          <div className="driver-actions">
            <div
              className="cy-station-filter-row"
              role="group"
              aria-label={t("viewLabel")}
            >
              <button
                type="button"
                className="cy-station-filter"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                {t("listView")}
              </button>
              <button
                type="button"
                className="cy-station-filter"
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                {t("mapView")}
              </button>
            </div>
            <Link href="/app/truecost" className="driver-secondary">
              Enter a destination and compare detour costs
              <ArrowUpRight />
            </Link>
          </div>
          {view === "map" && !loading && !error && (
            <StationMap
              center={origin ?? stationAreas[area]}
              userLocation={origin}
              markers={visibleStations.map((station) => ({
                name: `${station.name} (${t(isVerifiedStation(station) ? "discovery.verified" : "discovery.unverified")})`,
                address: station.address,
                latitude: station.latitude,
                longitude: station.longitude,
                warning:
                  station.availability.state === "unavailable"
                    ? "Unavailable"
                    : undefined,
              }))}
            />
          )}
          <div className="cy-station-results-heading">
            <div>
              <span className="cy-station-results-kicker">{t("city")}</span>
              <h2>{t("nearbyTitle")}</h2>
              <p>{t("resultCount", { count: visibleStations.length })}</p>
              <p>{t("discovery.radius", { radius: radiusKm })}</p>
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
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setReloadToken((current) => current + 1);
                }}
              >
                {t("retry")}
              </button>
            </p>
          )}
          {loading ? (
            <div
              className="cy-station-list"
              aria-label={t("loading")}
              aria-busy="true"
            >
              {[0, 1, 2].map((index) => (
                <div className="cy-station-skeleton" key={index} />
              ))}
            </div>
          ) : visibleStations.length ? (
            <>
              <div className="cy-station-list">
                {visibleStations.map((station) => {
                  const distance = formatter.format(station.distanceKm);
                  const spoken = `${station.name}. ${t("approxDistance", { distance })}`;
                  return (
                    <article className="cy-station-card" key={station.id}>
                      <div className="cy-station-card-mark" aria-hidden="true">
                        <GasPump weight="fill" />
                      </div>
                      <div className="cy-station-card-body">
                        <div className="cy-station-card-heading">
                          <div className="cy-station-card-name">
                            <h3>
                              <Link href={`/app/stations/${station.id}?fuelType=${fuel === "all" ? "petrol" : fuel}`}>
                                {station.name}
                              </Link>
                            </h3>
                            {station.address && <p>{station.address}</p>}
                          </div>
                          <SpeakerButton
                            text={spoken}
                            phraseId={`station-${station.id}`}
                          />
                        </div>
                        <StationInformation key={`${station.id}-${station.availability.expiresAt}`} station={station} availability={station.availability} />
                        <div className="cy-station-facts">
                          <span>
                            <NavigationArrow aria-hidden="true" />
                            {t("approxDistance", { distance })}
                          </span>
                        </div>
                        <div className="cy-station-card-actions">
                          <a
                            className="cy-button cy-button--outline"
                            href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("directions")}
                            <ArrowUpRight aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="cy-station-empty">
              <span className="cy-station-empty-icon" aria-hidden="true">
                <GasPump weight="fill" />
              </span>
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyMessage")}</p>
              {fuel !== "all" && <p>{t("discovery.noFuelMetadata")}</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
