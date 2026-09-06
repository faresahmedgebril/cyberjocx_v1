import { describe, expect, it } from "vitest";
import { isConversationParticipant } from "./dmAccess";
import { appRouter } from "./routers";

describe("profile, social, dm and admin contracts", () => {
  it("allows only either conversation participant", () => {
    const conversation = { userOneId: 12, userTwoId: 31 };
    expect(isConversationParticipant(conversation, 12)).toBe(true);
    expect(isConversationParticipant(conversation, 31)).toBe(true);
    expect(isConversationParticipant(conversation, 99)).toBe(false);
  });

  it("exposes the protected feature procedures", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toEqual(expect.arrayContaining([
      "profile.assets", "profile.addAsset", "community.create", "community.comment",
      "community.react", "community.share", "dm.conversations", "dm.messages", "dm.send",
      "admin.users", "admin.geo", "admin.nvd", "admin.syncNvd",
    ]));
  });
});
