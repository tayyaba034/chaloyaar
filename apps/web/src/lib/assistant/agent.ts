import "server-only";
import type { FuelType } from "@/lib/station-data";
import { formatReportTime, isAreaId, isFuelType, type AreaId, type StationSource } from "./find-stations";
import type { GeminiContent, Generate } from "./gemini";

export type ServiceType = "puncture" | "battery" | "towing";
export type AgentAction = { type: "roadside_help"; serviceType: ServiceType; href: string };
export type AgentResult = { answer: string; sources: StationSource[]; action: AgentAction | null };
type FindStations = (input: { fuel: FuelType | null; areaId: AreaId; origin: { latitude: number; longitude: number } | null }) => Promise<StationSource[]>;

const MAX_MODEL_TURNS = 3;
const languages = { en: "English", ur: "Urdu (Arabic script)", "ur-Latn": "Roman Urdu", "pa-Arab": "Punjabi in Shahmukhi script" } as const;

const tools = [{
  functionDeclarations: [
    {
      name: "find_stations",
      description: "Look up verified Faisalabad fuel stations within 15 km and their latest reported availability. Always call this before mentioning any station, distance or availability.",
      parameters: {
        type: "object",
        properties: {
          fuel: { type: "string", enum: ["petrol", "diesel", "cng"], description: "Fuel the driver needs. Omit if unclear." },
          area: { type: "string", enum: ["city-centre", "susan-road", "d-ground"], description: "Named pilot area. Omit to use the driver's shared location or the city centre." },
        },
      },
    },
    {
      name: "roadside_help",
      description: "Offer the driver a button to the roadside help form for a puncture, battery or towing problem. This does not send a request; the driver signs in, reviews a provider quote and confirms it themselves.",
      parameters: {
        type: "object",
        properties: { service: { type: "string", enum: ["puncture", "battery", "towing"] } },
        required: ["service"],
      },
    },
  ],
}];

function systemPrompt(locale: keyof typeof languages, hasLocation: boolean) {
  return [
    "You are the Chalo Yaar assistant for drivers in Faisalabad, Pakistan.",
    `Reply in ${languages[locale]}, in at most three short sentences.`,
    "Only state station names, distances, availability and report times that a tool returned. Copy numbers exactly as the tool gave them. Never guess prices, stock, queues or opening hours.",
    "Availability comes from user, station or admin reports and is not a guarantee of stock; say so when you mention it.",
    "If the tool returns no stations, say none were found and that coverage may be incomplete.",
    "For a puncture, flat battery or breakdown, call roadside_help. Never claim help has been requested or is on the way.",
    "Politely decline questions unrelated to fuel or roadside help in Faisalabad.",
    hasLocation ? "The driver has shared their location; omit the area unless they name one." : "The driver has not shared a location; use a named area or omit it for the city centre.",
  ].join(" ");
}

// Model output is accepted only if every number in it came from a tool result.
const toAsciiDigits = (text: string) => text
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

export function answerIsGrounded(answer: string, sources: StationSource[]) {
  const allowed = new Set<string>(["15"]);
  for (const source of sources) {
    allowed.add(source.distanceKm.toFixed(1));
    allowed.add(String(Math.round(source.distanceKm)));
    for (const value of [source.name, source.reportedAt ? formatReportTime(source.reportedAt) : ""]) {
      for (const number of value.match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(number);
    }
  }
  for (let count = 0; count <= sources.length; count += 1) allowed.add(String(count));
  const numbers = toAsciiDigits(answer).match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((number) => allowed.has(number) || allowed.has(String(Number(number))));
}

export async function runAgent(input: {
  message: string;
  locale: keyof typeof languages;
  origin: { latitude: number; longitude: number } | null;
  generate: Generate;
  findStations: FindStations;
}): Promise<AgentResult | null> {
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: input.message }] }];
  let sources: StationSource[] = [];
  let action: AgentAction | null = null;
  for (let turn = 0; turn < MAX_MODEL_TURNS; turn += 1) {
    const reply = await input.generate({
      systemInstruction: { parts: [{ text: systemPrompt(input.locale, input.origin !== null) }] },
      contents,
      tools,
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    });
    if (!reply) return null;
    const calls = reply.parts.filter((part) => part.functionCall);
    if (!calls.length) {
      const answer = reply.parts.map((part) => part.text ?? "").join("").trim();
      if (!answer || answer.length > 1_000 || !answerIsGrounded(answer, sources)) return null;
      return { answer, sources, action };
    }
    // Echo the model turn unchanged; Gemini needs its thought signatures back.
    contents.push(reply);
    const responses = [];
    for (const { functionCall } of calls) {
      const { name, args = {} } = functionCall!;
      if (name === "find_stations") {
        // Coordinates stay on the server; the model only sees the station facts.
        sources = await input.findStations({
          fuel: isFuelType(args.fuel) ? args.fuel : null,
          areaId: isAreaId(args.area) ? args.area : "city-centre",
          origin: isAreaId(args.area) ? null : input.origin,
        });
        responses.push({ functionResponse: { name, response: { stations: sources.map((source) => ({
          name: source.name,
          distance_km: source.distanceKm.toFixed(1),
          details_verified: source.verified,
          availability: source.availability,
          reported_at: source.reportedAt ? formatReportTime(source.reportedAt) : null,
        })) } } });
      } else if (name === "roadside_help" && (args.service === "puncture" || args.service === "battery" || args.service === "towing")) {
        action = { type: "roadside_help", serviceType: args.service, href: "/app/help" };
        responses.push({ functionResponse: { name, response: { offered: true, note: "A button to the help form is shown. Nothing has been sent yet." } } });
      } else {
        responses.push({ functionResponse: { name, response: { error: "Unknown tool or invalid arguments." } } });
      }
    }
    contents.push({ role: "user", parts: responses });
  }
  return null;
}
