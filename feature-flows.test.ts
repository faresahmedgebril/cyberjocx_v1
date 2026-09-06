import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptMessage } from "./secureMessages";

const { mockDb, insertValues, storagePutMock } = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue([]);
  const query: any = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve([])),
  };
  return {
    insertValues,
    storagePutMock: vi.fn(async () => ({ key: "mock/profile.pdf", url: "https://storage.example/profile.pdf" })),
    mockDb: {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => query),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    },
  };
});

vi.mock("./db", async () => ({ ...(await vi.importActual<typeof import("./db")>("./db")), getDb: vi.fn(async () => mockDb) }));
vi.mock("./storage", async () => ({ ...(await vi.importActual<typeof import("./storage")>("./storage")), storagePut: storagePutMock }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: { id: 7, openId: "flow-user", name: "Flow User", email: "flow@example.com", loginMethod: "test", role, points: 0, isVip: false, bio: null, avatarUrl: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("successful feature flows with isolated persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })), limit: vi.fn(() => Promise.resolve([])) })) })) }));
  });

  it("persists a private profile certificate metadata record", async () => {
    const result = await appRouter.createCaller(context()).profile.addAsset({ assetType: "certificate", title: "OWASP Certificate", isPublic: false });
    expect(result).toEqual({ success: true });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, assetType: "certificate", title: "OWASP Certificate", isPublic: false }));
    expect(storagePutMock).not.toHaveBeenCalled();
  });

  it("persists post, reel, and job post types with job details", async () => {
    const caller = appRouter.createCaller(context());
    await caller.community.create({ content: "A reel lesson", postType: "reel" });
    await caller.community.create({ content: "Security role", postType: "job", jobDetails: "Remote · Egypt · Apply by email" });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ postType: "reel" }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ postType: "job", jobDetails: "Remote · Egypt · Apply by email" }));
  });

  it("completes post creation, comment, reaction and share flows", async () => {
    const caller = appRouter.createCaller(context());
    expect(await caller.community.create({ content: "Security learning note" })).toEqual({ success: true });
    expect(await caller.community.comment({ postId: 11, content: "Useful reference" })).toEqual({ success: true });
    expect(await caller.community.react({ postId: 11, reaction: "love" })).toEqual({ reaction: "love" });
    expect(await caller.community.share({ postId: 11 })).toEqual({ shared: true });
    expect(insertValues).toHaveBeenCalled();
  });

  it("sends and decrypts messages for a participant while keeping storage opaque", async () => {
    const conversation = { id: 41, userOneId: 7, userTwoId: 8 };
    mockDb.select.mockImplementation(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([conversation])), orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) })) })) }));
    const caller = appRouter.createCaller(context());
    expect(await caller.dm.send({ conversationId: 41, content: "private hello" })).toEqual({ success: true });
    const inserted = insertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(inserted).toEqual(expect.objectContaining({ conversationId: 41, senderId: 7 }));
    expect(inserted.content).toBeUndefined();
    expect(inserted.ciphertext).toBeTruthy();

    const encrypted = encryptMessage("private hello");
    mockDb.select.mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([conversation])) })) })) }))
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ id: 1, senderId: 8, ...encrypted, createdAt: new Date(), readAt: null }])) })) })) })) }));
    const messages = await caller.dm.messages({ conversationId: 41 });
    expect(messages[0]).toMatchObject({ senderId: 8, content: "private hello" });
  });

  it("returns admin NVD status from the restricted procedure", async () => {
    const setting = { lastStatus: "success", lastImported: 4, lastCompletedAt: new Date() };
    mockDb.select.mockImplementationOnce(() => ({ from: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([setting])) })) }))
      .mockImplementationOnce(() => ({ from: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })) })) }));
    const result = await appRouter.createCaller(context("admin")).admin.nvd();
    expect(result.setting).toEqual(setting);
    expect(result.runs).toEqual([]);
  });
});
