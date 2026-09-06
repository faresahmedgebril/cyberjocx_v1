import { describe, expect, it } from "vitest";
import { canAccessAdmin } from "./adminAccess";

describe("admin access policy", () => {
  it("allows the verified owner email even when a stale role says user", () => {
    expect(canAccessAdmin({ email: " GebrilFares972@gmail.com ", role: "user" })).toBe(true);
  });

  it("keeps other users out unless their role is admin", () => {
    expect(canAccessAdmin({ email: "someone@example.com", role: "user" })).toBe(false);
    expect(canAccessAdmin({ email: "someone@example.com", role: "admin" })).toBe(true);
    expect(canAccessAdmin(null)).toBe(false);
  });
});
