import "server-only";

import { PDFParse } from "pdf-parse";

const OGRA_PUBLICATIONS_URL = "https://price.ogra.org.pk/?section=daily-fuel";
const OGRA_ORIGIN = "https://price.ogra.org.pk";

export type OfficialFuelPrices = {
  petrol: { amount: number; effectiveAt: string; source: string; sourceUrl: string };
  diesel: { amount: number; effectiveAt: string; source: string; sourceUrl: string };
};

let cached: { value: OfficialFuelPrices; expiresAt: number } | null = null;

function parseAmount(text: string, heading: RegExp) {
  const section = text.match(heading)?.[0] ?? "";
  const total = section.match(/Total\s+(?:Petrol|Diesel)\s+Price[\s\S]{0,250}?RS\/LTR\s+[A-Z]=\{[^}]+\}\s+([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!total) throw new Error("OGRA publication did not contain a readable retail price.");
  return Number(total[1]);
}

export async function getLatestOgraFuelPrices(): Promise<OfficialFuelPrices> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const publication = await fetch(OGRA_PUBLICATIONS_URL, {
    next: { revalidate: 60 * 30 },
    headers: { "User-Agent": "ChaloYaar price updater/1.0" },
  });
  if (!publication.ok) throw new Error(`OGRA publication list returned ${publication.status}.`);
  const html = await publication.text();
  const path = html.match(/(?:href=["'])?(\/document\/\d+\/file\?lang=en)/i)?.[1];
  if (!path) throw new Error("OGRA publication list did not contain an English price document.");
  const sourceUrl = new URL(path, OGRA_ORIGIN).toString();
  const parser = new PDFParse({ url: sourceUrl });
  try {
    const { text } = await parser.getText();
    const date = text.match(/PETROL \(MS\) Price Effective ([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1];
    if (!date) throw new Error("OGRA publication did not contain an effective date.");
    const effectiveAt = new Date(`${date} 00:00:00+05:00`).toISOString();
    const value = {
      petrol: {
        amount: parseAmount(text, /PETROL \(MS\)[\s\S]*?Full impact of revision/i),
        effectiveAt,
        source: "OGRA official price publication",
        sourceUrl,
      },
      diesel: {
        amount: parseAmount(text, /Diesel \(HSD\)[\s\S]*?Full impact of revision/i),
        effectiveAt,
        source: "OGRA official price publication",
        sourceUrl,
      },
    };
    cached = { value, expiresAt: Date.now() + 30 * 60 * 1000 };
    return value;
  } finally {
    await parser.destroy();
  }
}
