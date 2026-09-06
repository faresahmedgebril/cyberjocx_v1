import { describe, expect, it } from "vitest";
import { sdk } from "./_core/sdk";

describe("Heartbeat session authentication", () => {
  it("accepts a signed cron session without a display name", async () => {
    const token = await sdk.signSession({
      openId: "cron_regression_task",
      appId: "cyberjocx",
    });

    await expect(sdk.verifySession(token)).resolves.toMatchObject({
      openId: "cron_regression_task",
      appId: "cyberjocx",
      name: "",
    });
  });
});
