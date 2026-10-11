export type FuelType = "petrol" | "diesel" | "cng";

export type Station = {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  supportedFuels: FuelType[];
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  isDemo: boolean;
  source: string;
  sourceUrl: string | null;
  updatedAt: string | null;
};

export const demoStations: Station[] = [
  {
    id: "demo-faisalabad-1",
    name: "Demo station — City Centre",
    brand: null,
    address: "Sample location, Faisalabad",
    latitude: 31.4181,
    longitude: 73.0791,
    supportedFuels: ["petrol", "diesel"],
    verificationStatus: "unverified",
    isDemo: true,
    source: "Demo data",
    sourceUrl: null,
    updatedAt: null,
  },
  {
    id: "demo-faisalabad-2",
    name: "Demo station — Susan Road",
    brand: null,
    address: "Sample location, Faisalabad",
    latitude: 31.4077,
    longitude: 73.0912,
    supportedFuels: ["petrol"],
    verificationStatus: "unverified",
    isDemo: true,
    source: "Demo data",
    sourceUrl: null,
    updatedAt: null,
  },
  {
    id: "demo-faisalabad-3",
    name: "Demo station — D-Ground",
    brand: null,
    address: "Sample location, Faisalabad",
    latitude: 31.4093,
    longitude: 73.112,
    supportedFuels: ["petrol", "diesel", "cng"],
    verificationStatus: "unverified",
    isDemo: true,
    source: "Demo data",
    sourceUrl: null,
    updatedAt: null,
  },
];
