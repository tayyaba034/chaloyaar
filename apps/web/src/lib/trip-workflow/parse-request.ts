// Deterministic parser for errand requests in English, Roman Urdu and Urdu. It works without any
// LLM; an optional LLM parse must produce the same ParsedRequest shape and is validated the same way.
import type { BusinessCategory } from "../businesses";

export type ParsedErrand = {
  label: string;
  categories: BusinessCategory[];
  serviceQuery: string;
  mandatory: boolean;
  deadline: { hour: number; minute: number; kind: "hard" | "soft" } | null;
  preferred: { fromHour: number; toHour: number } | null;
  sourceText: string;
};
export type ParsedRequest = {
  errands: ParsedErrand[];
  day: "today" | "tomorrow";
  preference: "cheapest" | "fastest" | "balanced";
  returnToOrigin: boolean;
  wantsVerification: boolean;
  unrecognised: string[];
};

type Rule = { pattern: RegExp; label: string; categories: BusinessCategory[]; serviceQuery: string };

// Order matters: more specific needs first.
const rules: Rule[] = [
  { pattern: /\b(car\s*)?a\.?c\.?\b.*\b(repair|fix|check|service|gas|thik|theek)|\b(repair|fix|check|thik|theek)\b.*\b(car\s*)?a\.?c\b|اے\s*سی/i, label: "Car AC repair", categories: ["mechanic", "workshop"], serviceQuery: "car ac" },
  { pattern: /puncture|tyre|tire|pancher|پنکچر|ٹائر/i, label: "Tyre / puncture repair", categories: ["mechanic", "workshop"], serviceQuery: "puncture" },
  { pattern: /battery|بیٹری/i, label: "Car battery", categories: ["mechanic", "shop"], serviceQuery: "battery" },
  { pattern: /oil\s*change|tune|engine|mechanic|mistri|mistry|garage|workshop|مستری|ورکشاپ/i, label: "Mechanic", categories: ["mechanic", "workshop"], serviceQuery: "mechanic" },
  { pattern: /spare\s*part|parts|پرزہ|پرزے/i, label: "Spare parts", categories: ["shop", "mechanic"], serviceQuery: "spare parts" },
  { pattern: /medicine|medicines|pharmacy|chemist|dawai|dawa|dawaai|tablets|prescription|دوائی|دوا|ادویات|فارمیسی/i, label: "Medicine", categories: ["pharmacy"], serviceQuery: "prescription medicines" },
  { pattern: /dentist|teeth|daant|دانت/i, label: "Dentist", categories: ["clinic"], serviceQuery: "dental" },
  { pattern: /doctor|clinic|check\s*-?up|daktar|dr\.|ڈاکٹر|کلینک|bp|blood\s*pressure/i, label: "Clinic visit", categories: ["clinic"], serviceQuery: "general physician" },
  { pattern: /parcel|courier|tcs|leopard|پارسل/i, label: "Collect parcel", categories: ["office"], serviceQuery: "parcel" },
  { pattern: /document|documents|certificate|attest|nadra|passport|kaghaz|kagaz|form|office|دستاویز|کاغذ|سرٹیفکیٹ|دفتر/i, label: "Collect document", categories: ["office"], serviceQuery: "document collection" },
  { pattern: /bank|cheque|بینک/i, label: "Bank", categories: ["office"], serviceQuery: "bank" },
  { pattern: /photocopy|print|copy|فوٹو\s*کاپی/i, label: "Print / photocopy", categories: ["other_service"], serviceQuery: "photocopy print" },
  { pattern: /laundry|dry\s*clean|dhobi|دھوبی/i, label: "Laundry", categories: ["other_service"], serviceQuery: "laundry" },
  { pattern: /grocery|groceries|sabzi|shop|buy|kharid|سودا|دکان|خرید/i, label: "Shopping", categories: ["shop"], serviceQuery: "shop" },
];

const splitter = /\s*(?:,|;|\band\b|\bthen\b|\baur\b|\bphir\b|\bplus\b|اور|پھر|،|\.\s)\s*/i;
const filler = /^(i\s+need\s+to|i\s+want\s+to|please|also|and|help\s+me|plan|find|get|mujhe|mujhay|karna|hai|today|aaj)\b/i;

function parseClock(text: string): { hour: number; minute: number } | null {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|بجے)?/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  else if (suffix === "am" && hour === 12) hour = 0;
  // "before 5" in a day-time errand context means 17:00.
  else if (!suffix || suffix === "baje" || suffix === "بجے") if (hour >= 1 && hour <= 7) hour += 12;
  return { hour, minute };
}

function deadlineIn(text: string): ParsedErrand["deadline"] {
  const hard = /\b(must|latest|strictly|zaroor|lazmi)\b|ضرور/i.test(text);
  const match = /(?:before|by|until|till|tak|se\s+pehle|sy\s+pehly|سے\s+پہلے|تک)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|بجے)?)|(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|بجے)?)\s*(?:se\s+pehle|sy\s+pehly|tak|سے\s+پہلے|تک)/i.exec(text);
  const clock = match ? parseClock(match[1] ?? match[2]) : null;
  return clock ? { ...clock, kind: hard ? "hard" : "soft" } : null;
}

function preferredIn(text: string): ParsedErrand["preferred"] {
  if (/morning|subah|صبح/i.test(text)) return { fromHour: 9, toHour: 12 };
  if (/afternoon|dopehar|دوپہر/i.test(text)) return { fromHour: 12, toHour: 17 };
  if (/evening|shaam|sham|شام/i.test(text)) return { fromHour: 17, toHour: 21 };
  return null;
}

export function parseRequest(text: string): ParsedRequest {
  const input = text.trim().slice(0, 1000);
  const errands: ParsedErrand[] = [];
  const unrecognised: string[] = [];
  for (const chunk of input.split(splitter).map((part) => part.trim()).filter(Boolean)) {
    const rule = rules.find((candidate) => candidate.pattern.test(chunk));
    if (!rule) {
      const cleaned = chunk.replace(filler, "").trim();
      if (cleaned.length > 2 && !/(avoid|unnecessary|trip|cheap|practical|verify|before\s+i\s+leave|places|available|sasta|safar)/i.test(cleaned)) unrecognised.push(chunk);
      continue;
    }
    if (errands.some((errand) => errand.label === rule.label)) continue;
    errands.push({
      label: rule.label,
      categories: rule.categories,
      serviceQuery: rule.serviceQuery,
      mandatory: !/\b(if possible|optional|agar ho sake|maybe)\b|اگر\s*ہو\s*سکے/i.test(chunk),
      deadline: deadlineIn(chunk) ?? deadlineIn(input.length < 120 ? input : ""),
      preferred: preferredIn(chunk),
      sourceText: chunk.slice(0, 120),
    });
  }
  return {
    errands,
    day: /tomorrow|\bkal\b|کل/i.test(input) ? "tomorrow" : "today",
    preference: /cheap|cheapest|sasta|kam\s*kharch|save\s+(fuel|money)|سستا/i.test(input) ? "cheapest"
      : /fast|fastest|quick|jaldi|جلدی/i.test(input) ? "fastest" : "balanced",
    returnToOrigin: !/one\s*way|don'?t\s+(come|return)|wapas\s+nahi|واپس\s+نہیں/i.test(input),
    wantsVerification: true,
    unrecognised,
  };
}

// Time weight (PKR per minute) implied by a stated preference; the user can change it.
export function timeWeightFor(preference: ParsedRequest["preference"], base: number) {
  return preference === "cheapest" ? Math.min(base, 0.5) : preference === "fastest" ? Math.max(base, 6) : base;
}
