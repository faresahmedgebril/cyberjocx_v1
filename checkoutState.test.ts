import { describe, expect, it } from "vitest";
import { isDebitSuccessful } from "./checkoutState";

describe("points checkout debit guard", () => {
  it("accepts exactly one affected user row", () => {
    expect(isDebitSuccessful(1)).toBe(true);
  });

  it("rejects a race, missing user, or malformed result", () => {
    expect(isDebitSuccessful(0)).toBe(false);
    expect(isDebitSuccessful(2)).toBe(false);
    expect(isDebitSuccessful(Number.NaN)).toBe(false);
  });
});
