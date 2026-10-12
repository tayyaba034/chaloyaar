"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";

export type PlaceOption = {
  id: string;
  nameEn: string;
  nameUr: string | null;
  nameRoman: string | null;
  kind: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
};

export function placeName(place: PlaceOption, locale: string) {
  if ((locale === "ur" || locale === "pa-Arab") && place.nameUr) return place.nameUr;
  if (locale === "ur-Latn" && place.nameRoman) return place.nameRoman;
  return place.nameEn;
}

// Accessible combobox over the free OSM gazetteer (/api/places/search).
export function PlaceSearch({
  label,
  near,
  onSelect,
}: {
  label: string;
  near?: { latitude: number; longitude: number } | null;
  onSelect: (place: PlaceOption) => void;
}) {
  const t = useTranslations("placeSearch");
  const locale = useLocale();
  const id = useId();
  const [text, setText] = useState("");
  const [results, setResults] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const query = text.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "8" });
        if (near) {
          params.set("lat", String(near.latitude));
          params.set("lng", String(near.longitude));
        }
        const response = await fetch(`/api/places/search?${params}`, { signal: controller.signal });
        if (!response.ok) {
          setFailure(await readFailure(response));
          setResults([]);
          return;
        }
        const body = await response.json() as { places: PlaceOption[] };
        setFailure(null);
        setResults(body.places);
        setActive(-1);
        setOpen(true);
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ message: error instanceof Error && error.name === "TypeError" ? t("offline") : t("error") });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, near, t]);

  function choose(place: PlaceOption) {
    skipNext.current = true;
    setText(placeName(place, locale));
    setOpen(false);
    onSelect(place);
  }

  const listOpen = open && text.trim().length >= 2;
  return (
    <div className="place-search">
      <label htmlFor={`${id}-input`}>{label}</label>
      <div className="place-search-field">
        <MagnifyingGlass aria-hidden="true" />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          value={text}
          placeholder={t("placeholder")}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (!listOpen || !results.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % results.length); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((active - 1 + results.length) % results.length); }
            if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(results[active]); }
            if (event.key === "Escape") setOpen(false);
          }}
        />
        {loading && <span className="driver-small" role="status">{t("searching")}</span>}
      </div>
      {listOpen && (
        <ul id={`${id}-list`} role="listbox" className="place-search-results">
          {results.length === 0 ? (
            <li className="driver-small" role="option" aria-selected="false" aria-disabled="true">{t("noResults")}</li>
          ) : results.map((place, index) => (
            <li
              key={place.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : undefined}
              onMouseDown={(event) => { event.preventDefault(); choose(place); }}
            >
              <strong>{placeName(place, locale)}</strong>
              <span className="driver-small">
                {t(`kinds.${place.kind}`)}
                {place.distanceKm !== null && ` · ${t("distance", { km: place.distanceKm.toFixed(1) })}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {failure && <SetupNotice failure={failure} />}
      <p className="driver-small place-search-credit" lang="en" dir="ltr">© OpenStreetMap contributors</p>
    </div>
  );
}
