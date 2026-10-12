import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseState, type AvailabilityState } from "./availability-machine";

export const businessCategories = ["mechanic", "workshop", "clinic", "pharmacy", "office", "shop", "other_service"] as const;
export type BusinessCategory = (typeof businessCategories)[number];

export type BusinessService = { id: string; name: string; tag: string | null; durationMinutes: number; priceNote: string | null };
export type Availability = {
  state: AvailabilityState;
  source: string | null;
  submittedAt: string | null;
  until: string | null;
  explanation: string | null;
};
export type BusinessSummary = {
  id: string;
  name: string;
  category: BusinessCategory;
  description: string | null;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  listingStatus: "active" | "unclaimed";
  isDemo: boolean;
  publishedHoursText: string | null;
  distanceKm: number | null;
  availability: Availability;
  services: BusinessService[];
};

export const showDemoBusinesses = () => process.env.SHOW_DEMO_BUSINESSES === "true";

function toSummary(row: Record<string, unknown>): BusinessSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    category: row.category as BusinessCategory,
    description: (row.description as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    listingStatus: row.listing_status === "active" ? "active" : "unclaimed",
    isDemo: row.is_demo === true,
    publishedHoursText: (row.published_hours_text as string | null) ?? null,
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    availability: {
      state: normaliseState(row.availability_state),
      source: (row.availability_source as string | null) ?? null,
      submittedAt: (row.availability_submitted_at as string | null) ?? null,
      until: (row.availability_until as string | null) ?? null,
      explanation: (row.availability_explanation as string | null) ?? null,
    },
    services: Array.isArray(row.services) ? (row.services as BusinessService[]) : [],
  };
}

export async function searchBusinesses(client: SupabaseClient, params: {
  query?: string | null; category?: BusinessCategory | null; near?: { latitude: number; longitude: number } | null; radiusKm?: number; limit?: number;
}) {
  const { data, error } = await client.rpc("search_businesses", {
    query: params.query || null,
    wanted_category: params.category ?? null,
    near_latitude: params.near?.latitude ?? null,
    near_longitude: params.near?.longitude ?? null,
    radius_km: params.radiusKm ?? 15,
    include_demo: showDemoBusinesses(),
    max_results: params.limit ?? 20,
  });
  if (error) return { ok: false as const, error };
  return { ok: true as const, businesses: (data as Array<Record<string, unknown>>).map(toSummary) };
}

export type HoursRow = { weekday: number; opensAt: string; closesAt: string; closesNextDay: boolean; isClosed: boolean; validOn: string | null; source: string };

export async function businessDetails(client: SupabaseClient, id: string) {
  const { data: business, error } = await client.from("businesses")
    .select("id,name,category,description,address,phone,latitude,longitude,listing_status,is_demo,published_hours_text,source")
    .eq("id", id).maybeSingle();
  if (error) return { ok: false as const, error };
  if (!business || (business.is_demo && !showDemoBusinesses()) || !["active", "unclaimed"].includes(String(business.listing_status))) return { ok: false as const, notFound: true as const };
  const [services, hours, availability] = await Promise.all([
    client.from("services").select("id,name,tag,description,duration_minutes,price_note").eq("business_id", id).eq("is_active", true).order("name"),
    client.from("business_hours").select("weekday,opens_at,closes_at,closes_next_day,is_closed,valid_on,source").eq("business_id", id).order("weekday"),
    client.rpc("current_availability", { target_business: id }),
  ]);
  const serviceRows = services.data ?? [];
  const perService = await Promise.all(serviceRows.map(async (service) => {
    const { data } = await client.rpc("current_availability", { target_business: id, target_service: service.id });
    return [service.id, (data as Array<Record<string, unknown>> | null)?.[0] ?? null] as const;
  }));
  const toAvailability = (row: Record<string, unknown> | null | undefined): Availability => ({
    state: normaliseState(row?.state),
    source: (row?.source as string | null) ?? null,
    submittedAt: (row?.submitted_at as string | null) ?? null,
    until: (row?.effective_until as string | null) ?? null,
    explanation: (row?.explanation as string | null) ?? null,
  });
  const near = { latitude: Number(business.latitude), longitude: Number(business.longitude) };
  const alternatives = await searchBusinesses(client, { category: business.category as BusinessCategory, near, radiusKm: 8, limit: 6 });
  return {
    ok: true as const,
    business: {
      id: business.id as string,
      name: business.name as string,
      category: business.category as BusinessCategory,
      description: business.description as string | null,
      address: business.address as string | null,
      phone: business.phone as string | null,
      latitude: near.latitude,
      longitude: near.longitude,
      listingStatus: business.listing_status as string,
      isDemo: business.is_demo === true,
      source: business.source as string,
      publishedHoursText: business.published_hours_text as string | null,
    },
    availability: toAvailability((availability.data as Array<Record<string, unknown>> | null)?.[0]),
    services: serviceRows.map((service) => ({
      id: service.id as string, name: service.name as string, tag: service.tag as string | null, description: service.description as string | null,
      durationMinutes: Number(service.duration_minutes), priceNote: service.price_note as string | null,
      availability: toAvailability(perService.find(([serviceId]) => serviceId === service.id)?.[1]),
    })),
    hours: (hours.data ?? []).map((row): HoursRow => ({
      weekday: Number(row.weekday), opensAt: String(row.opens_at).slice(0, 5), closesAt: String(row.closes_at).slice(0, 5),
      closesNextDay: row.closes_next_day === true, isClosed: row.is_closed === true, validOn: row.valid_on as string | null, source: String(row.source),
    })),
    alternatives: alternatives.ok ? alternatives.businesses.filter((item) => item.id !== id).slice(0, 5) : [],
  };
}
