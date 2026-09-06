import { describe, expect, it } from "vitest";
import { nextTheme, readLanguage, readTheme, saveLanguage, saveTheme } from "../client/src/lib/preferences";

describe("CyberJocx preferences", () => {
  it("normalizes the saved language and rejects unsupported values", () => {
    expect(readLanguage("en")).toBe("en");
    expect(readLanguage("ar")).toBe("ar");
    expect(readLanguage("fr")).toBe("ar");
    expect(readLanguage(null)).toBe("ar");
  });

  it("writes language and theme to the same storage keys used by the app", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    saveLanguage(storage, "en");
    saveTheme(storage, "light");
    expect(readLanguage(storage.getItem("cyberjocx-language"))).toBe("en");
    expect(readTheme(storage.getItem("theme"))).toBe("light");
  });

  it("persists a safe theme value and toggles it", () => {
    expect(readTheme("light")).toBe("light");
    expect(readTheme("dark")).toBe("dark");
    expect(readTheme("broken", "dark")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});
