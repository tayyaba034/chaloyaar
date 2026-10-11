import { describe, expect, it } from "vitest";
import english from "./en.json";
import punjabi from "./pa-Arab.json";
import romanUrdu from "./ur-Latn.json";
import urdu from "./ur.json";

type MessageValue = string | { [key: string]: MessageValue };

function messageKeys(value: MessageValue, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    messageKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translation catalogs", () => {
  it("keep the same message keys in every supported language", () => {
    const expected = messageKeys(english).sort();

    for (const messages of [urdu, romanUrdu, punjabi]) {
      expect(messageKeys(messages).sort()).toEqual(expected);
    }
  });
});
