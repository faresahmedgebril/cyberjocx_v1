import { describe, expect, it } from "vitest";
import { nextReaction, nextShareState } from "./socialState";

describe("social interaction state", () => {
  it("selects a reaction and toggles the same reaction off", () => {
    expect(nextReaction(null, "love")).toBe("love");
    expect(nextReaction("love", "angry")).toBe("angry");
    expect(nextReaction("love", "love")).toBeNull();
  });

  it("turns sharing on only once for a user", () => {
    expect(nextShareState(false)).toBe(true);
    expect(nextShareState(true)).toBe(false);
  });
});
