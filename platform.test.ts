import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(user?: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("cyberjocx platform procedures", () => {
  it("returns a safe empty catalog when the database is unavailable", async () => {
    const caller = appRouter.createCaller(createContext());
    const courses = await caller.courses.list({});
    const tracks = await caller.tracks.list();
    const roadmaps = await caller.roadmaps.list();
    expect(Array.isArray(courses)).toBe(true);
    expect(Array.isArray(tracks)).toBe(true);
    expect(Array.isArray(roadmaps)).toBe(true);
  }, 15000);

  it("does not allow non-admin users to access admin statistics", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 7,
      openId: "operator-7",
      name: "Operator",
      email: "operator@example.com",
      loginMethod: "test",
      role: "user",
      points: 640,
      isVip: false,
      bio: null,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    await expect(caller.admin.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a safe friends collection and accepts a malware category filter", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 7,
      openId: "operator-7",
      name: "Operator",
      email: "operator@example.com",
      loginMethod: "test",
      role: "user",
      points: 640,
      isVip: false,
      bio: null,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    const friends = await caller.community.friends();
    const malware = await caller.malware.list({ category: "Ransomware" });
    expect(Array.isArray(friends)).toBe(true);
    expect(Array.isArray(malware)).toBe(true);
  }, 15000);

  it("protects profile assets, social actions, and admin geo from anonymous callers", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.profile.assets()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addAsset({ assetType: "achievement", title: "blocked" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.community.comment({ postId: 999999998, content: "blocked" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.community.react({ postId: 999999998, reaction: "like" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.community.share({ postId: 999999998 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.admin.geo()).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 15000);

  it("covers authenticated profile and DM read flows plus admin NVD status", async () => {
    const userCaller = appRouter.createCaller(createContext({
      id: 7,
      openId: "operator-7",
      name: "Operator",
      email: "operator@example.com",
      loginMethod: "test",
      role: "user",
      points: 640,
      isVip: false,
      bio: null,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    const assets = await userCaller.profile.assets();
    const conversations = await userCaller.dm.conversations();
    const feed = await userCaller.community.feed();
    expect(Array.isArray(assets)).toBe(true);
    expect(Array.isArray(conversations)).toBe(true);
    expect(Array.isArray(feed)).toBe(true);

    const adminCaller = appRouter.createCaller({
      ...createContext({
        id: 7,
        openId: "admin-7",
        name: "Admin",
        email: "admin@example.com",
        loginMethod: "test",
        role: "admin",
        points: 0,
        isVip: false,
        bio: null,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }),
    });
    const nvd = await adminCaller.admin.nvd();
    expect(nvd).toHaveProperty("setting");
    expect(Array.isArray(nvd.runs)).toBe(true);
  }, 15000);

  it("rejects non-participants from DM read/write and admin audit", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 999999998,
      openId: "outsider",
      name: "Outsider",
      email: "outsider@example.com",
      loginMethod: "test",
      role: "user",
      points: 0,
      isVip: false,
      bio: null,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    await expect(caller.dm.messages({ conversationId: 999999998 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.dm.send({ conversationId: 999999998, content: "should be blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.messages({ conversationId: 999999998 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 15000);

  it("allows an admin caller to use the restricted message audit path", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 7,
      openId: "admin-7",
      name: "Admin",
      email: "admin@example.com",
      loginMethod: "test",
      role: "admin",
      points: 0,
      isVip: false,
      bio: null,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    const messages = await caller.admin.messages({ conversationId: 999999998 });
    expect(messages).toEqual([]);
  }, 15000);

  it("finds an imported Trickest CVE through the paginated catalog", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.cves.paginated({ search: "CVE-2026-0009", page: 1, pageSize: 10 });
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.some(item => item.cveNumber === "CVE-2026-0009")).toBe(true);
  }, 15000);
});
