import { TRPCError } from "@trpc/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { nanoid } from "nanoid";
import { getSessionCookieOptions } from "./_core/cookies";
import { storagePut } from "./storage";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { books, cartItems, carts, certificates, courseProgress, courses, cves, friendRequests, follows, malwareFamilies, notifications, nvdSyncSettings, nvdSyncRuns, pointOrderItems, pointOrders, postLikes, posts, postComments, postReactions, postShares, profileAssets, conversations, directMessages, userPresence, roadmaps, quizAttempts, quizQuestions, trackQuizzes, tracks, tools, users, getCart, getDashboardStats, getDb, getPublicProfile, getTrackProgress, getTrackRoadmap, getUserById, listBooks, listBooksAdvanced, listCourses, listCves, listCvesPaginated, listMalware, listPosts, listTools, listToolsAdvanced, listRoadmaps, listTracks, ensureCart, listProfileAssets, upsertUserPresence, getAdminGeoStats, getUserSocialStats, listAdminUsers } from "./db";
import { z } from "zod";
import { decryptMessage, encryptMessage } from "./secureMessages";
import { isConversationParticipant } from "./dmAccess";
import { nextReaction, nextShareState } from "./socialState";
import { parseProfileAssetDataUrl } from "./profileAssets";
import { isDebitSuccessful } from "./checkoutState";
import { syncRecentNvd } from "./nvdSync";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.user.id)),
  profile: router({
    me: protectedProcedure.query(({ ctx }) => ctx.user),
    byId: publicProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      const profile = await getPublicProfile(input.userId);
      if (!profile) return undefined;
      const { email: _email, phone: _phone, linkedinUrl: _linkedinUrl, ...publicUser } = profile.user;
      return { ...profile, user: publicUser };
    }),
    update: protectedProcedure.input(z.object({ name: z.string().min(2).max(120).optional(), bio: z.string().max(500).optional(), avatarUrl: z.string().url().optional(), bannerUrl: z.string().url().optional(), phone: z.string().max(32).optional(), linkedinUrl: z.string().url().optional(), memberRank: z.enum(["learner", "contributor", "analyst", "mentor", "elite"]).optional(), primaryTrackId: z.number().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(users).set(input).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    uploadMedia: protectedProcedure.input(z.object({ kind: z.enum(["avatar", "banner"]), dataUrl: z.string().max(4_200_000) })).mutation(async ({ ctx, input }) => {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "يرجى رفع صورة PNG أو JPG أو WEBP صالحة." });
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.byteLength > 3 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم الصورة يجب ألا يزيد عن 3 ميغابايت." });
      const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
      const stored = await storagePut(`profiles/${ctx.user.id}/${input.kind}.${extension}`, bytes, match[1]);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(users).set(input.kind === "avatar" ? { avatarUrl: stored.url } : { bannerUrl: stored.url }).where(eq(users.id, ctx.user.id));
      return stored;
    }),
    assets: protectedProcedure.query(({ ctx }) => listProfileAssets(ctx.user.id, true)),
    stats: publicProcedure.input(z.object({ userId: z.number().optional() }).optional()).query(({ ctx, input }) => getUserSocialStats(input?.userId ?? ctx.user?.id ?? 0)),
    addAsset: protectedProcedure.input(z.object({ assetType: z.enum(["resume", "certificate", "achievement"]), title: z.string().min(2).max(255), description: z.string().max(2000).optional(), issuedAt: z.string().max(32).optional(), externalUrl: z.string().url().optional(), isPublic: z.boolean().default(true), fileName: z.string().max(120).optional(), dataUrl: z.string().max(7_000_000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      let fileUrl: string | undefined;
      let fileKey: string | undefined;
      if (input.dataUrl) {
        let upload;
        try {
          upload = parseProfileAssetDataUrl(input.dataUrl);
        } catch (error) {
          if (error instanceof Error && error.message === "PROFILE_ASSET_TOO_LARGE") throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم الملف يجب ألا يزيد عن 5 ميغابايت." });
          throw new TRPCError({ code: "BAD_REQUEST", message: "الملف يجب أن يكون PDF أو PNG أو JPG أو WEBP." });
        }
        if (!upload) throw new TRPCError({ code: "BAD_REQUEST", message: "الملف غير صالح." });
        const stored = await storagePut(`profiles/${ctx.user.id}/assets/${nanoid(12)}.${upload.extension}`, upload.bytes, upload.contentType);
        fileUrl = stored.url;
        fileKey = stored.key;
      }
      await db.insert(profileAssets).values({ userId: ctx.user.id, assetType: input.assetType, title: input.title, description: input.description || null, issuedAt: input.issuedAt || null, externalUrl: input.externalUrl || null, isPublic: input.isPublic, fileUrl: fileUrl || null, fileKey: fileKey || null });
      return { success: true };
    }),
    deleteAsset: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(profileAssets).where(and(eq(profileAssets.id, input.id), eq(profileAssets.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  presence: router({
    heartbeat: protectedProcedure.input(z.object({ countryCode: z.string().max(8).optional(), countryName: z.string().max(120).optional(), timezone: z.string().max(120).optional() })).mutation(({ ctx, input }) => upsertUserPresence(ctx.user.id, input.countryCode, input.countryName, input.timezone).then(() => ({ success: true }))),
  }),
  roadmaps: router({
    list: publicProcedure.query(({ ctx }) => listRoadmaps(ctx.user?.id)),
  }),
  tracks: router({
    list: publicProcedure.query(({ ctx }) => listTracks(ctx.user?.id)),
    roadmap: publicProcedure.input(z.object({ trackId: z.number() })).query(({ ctx, input }) => getTrackRoadmap(ctx.user?.id, input.trackId)),
    progress: protectedProcedure.input(z.object({ trackId: z.number() })).query(({ ctx, input }) => getTrackProgress(ctx.user.id, input.trackId)),
    submitQuiz: protectedProcedure.input(z.object({ quizId: z.number(), answers: z.array(z.number()) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, input.quizId)).orderBy(quizQuestions.orderIndex);
      const quiz = (await db.select().from(trackQuizzes).where(eq(trackQuizzes.id, input.quizId)).limit(1))[0];
      if (!quiz || !questions.length) throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
      const correct = questions.reduce((sum, question, index) => sum + (input.answers[index] === question.answerIndex ? 1 : 0), 0);
      const score = Math.round((correct / questions.length) * 100);
      const passed = score >= quiz.passingScore;
      await db.insert(quizAttempts).values({ quizId: input.quizId, userId: ctx.user.id, score, passed, answersJson: JSON.stringify(input.answers) });
      let certificateCode: string | undefined;
      if (passed) {
        const existingCertificate = quiz.trackLevelId ? (await db.select().from(certificates).where(and(eq(certificates.userId, ctx.user.id), eq(certificates.trackLevelId, quiz.trackLevelId))).limit(1))[0] : undefined;
        certificateCode = existingCertificate?.certificateCode ?? `CJX-${nanoid(10).toUpperCase()}`;
        if (!existingCertificate) await db.insert(certificates).values({ userId: ctx.user.id, trackId: quiz.trackId, trackLevelId: quiz.trackLevelId ?? null, certificateCode });
      }
      return { score, passed, certificateCode };
    }),
  }),
  courses: router({
    list: publicProcedure.input(z.object({ search: z.string().optional() }).optional()).query(({ input }) => listCourses(input?.search)),
    byId: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return undefined;
      const rows = await db.select().from(courses).where(eq(courses.id, input.id)).limit(1);
      return rows[0];
    }),
    progress: protectedProcedure.input(z.object({ courseId: z.number(), progress: z.number().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const completed = input.progress >= 100;
      const existing = await db.select().from(courseProgress).where(and(eq(courseProgress.userId, ctx.user.id), eq(courseProgress.courseId, input.courseId))).limit(1);
      if (existing[0]) await db.update(courseProgress).set({ progress: input.progress, completed }).where(eq(courseProgress.id, existing[0].id));
      else await db.insert(courseProgress).values({ userId: ctx.user.id, courseId: input.courseId, progress: input.progress, completed });
      return { success: true, completed };
    }),
  }),
  cves: router({
    list: publicProcedure.input(z.object({ search: z.string().optional(), severity: z.enum(["critical", "high", "medium", "low"]).optional() }).optional()).query(({ input }) => listCves(input?.search, input?.severity)),
    paginated: publicProcedure.input(z.object({ search: z.string().optional(), severity: z.enum(["critical", "high", "medium", "low"]).optional(), page: z.number().min(1).default(1), pageSize: z.number().min(1).max(50).default(12) })).query(({ input }) => listCvesPaginated(input.search, input.severity, input.page, input.pageSize)),
    byId: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return undefined;
      const rows = await db.select().from(cves).where(eq(cves.id, input.id)).limit(1);
      return rows[0];
    }),
  }),
  tools: router({
    list: publicProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional() }).optional()).query(({ input }) => listTools(input?.search, input?.category)),
    advanced: publicProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional(), sort: z.enum(["name", "category", "recent"]).optional() }).optional()).query(({ input }) => listToolsAdvanced(input?.search, input?.category, input?.sort)),
  }),
  community: router({
    feed: publicProcedure.query(({ ctx }) => listPosts(ctx.user?.id)),
    create: protectedProcedure.input(z.object({ content: z.string().min(1).max(4000), postType: z.enum(["post", "reel", "job"]).default("post"), jobDetails: z.string().max(2000).optional(), imageUrl: z.string().url().optional(), imageDataUrl: z.string().max(4_200_000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      let imageUrl = input.imageUrl;
      if (input.imageDataUrl) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.imageDataUrl);
        if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "صورة المنشور يجب أن تكون PNG أو JPG أو WEBP." });
        const bytes = Buffer.from(match[2], "base64");
        if (bytes.byteLength > 3 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم صورة المنشور يجب ألا يزيد عن 3 ميغابايت." });
        const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
        imageUrl = (await storagePut(`posts/${ctx.user.id}/${nanoid(12)}.${extension}`, bytes, match[1])).url;
      }
      await db.insert(posts).values({ userId: ctx.user.id, content: input.content, postType: input.postType, jobDetails: input.jobDetails || null, imageUrl });
      return { success: true };
    }),
    follow: protectedProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db || input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid target" });
      const existing = await db.select().from(follows).where(and(eq(follows.followerId, ctx.user.id), eq(follows.followingId, input.userId))).limit(1);
      if (existing[0]) { await db.delete(follows).where(eq(follows.id, existing[0].id)); return { following: false }; }
      await db.insert(follows).values({ followerId: ctx.user.id, followingId: input.userId });
      return { following: true };
    }),
    friendRequests: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(friendRequests).where(eq(friendRequests.recipientId, ctx.user.id)).orderBy(desc(friendRequests.createdAt));
    }),
    friends: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const requests = await db.select().from(friendRequests).where(and(eq(friendRequests.status, "accepted"), or(eq(friendRequests.senderId, ctx.user.id), eq(friendRequests.recipientId, ctx.user.id))));
      const friendIds = requests.map(request => request.senderId === ctx.user.id ? request.recipientId : request.senderId);
      if (!friendIds.length) return [];
      const allUsers = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, memberRank: users.memberRank, primaryTrackId: users.primaryTrackId }).from(users);
      return allUsers.filter(item => friendIds.includes(item.id));
    }),
    sendFriendRequest: protectedProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db || input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid user" });
      const existing = await db.select().from(friendRequests).where(and(eq(friendRequests.senderId, ctx.user.id), eq(friendRequests.recipientId, input.userId))).limit(1);
      if (existing[0]) return { success: true, status: existing[0].status };
      await db.insert(friendRequests).values({ senderId: ctx.user.id, recipientId: input.userId });
      return { success: true, status: "pending" as const };
    }),
    respondFriendRequest: protectedProcedure.input(z.object({ requestId: z.number(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const request = (await db.select().from(friendRequests).where(and(eq(friendRequests.id, input.requestId), eq(friendRequests.recipientId, ctx.user.id))).limit(1))[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(friendRequests).set({ status: input.accept ? "accepted" : "declined" }).where(eq(friendRequests.id, request.id));
      return { success: true };
    }),
    like: protectedProcedure.input(z.object({ postId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db.select().from(postLikes).where(and(eq(postLikes.postId, input.postId), eq(postLikes.userId, ctx.user.id))).limit(1);
      if (existing[0]) {
        await db.delete(postLikes).where(eq(postLikes.id, existing[0].id));
        await db.update(posts).set({ likesCount: sql`${posts.likesCount} - 1` }).where(eq(posts.id, input.postId));
        return { liked: false };
      }
      await db.insert(postLikes).values({ postId: input.postId, userId: ctx.user.id });
      await db.update(posts).set({ likesCount: sql`${posts.likesCount} + 1` }).where(eq(posts.id, input.postId));
      return { liked: true };
    }),
    comment: protectedProcedure.input(z.object({ postId: z.number(), content: z.string().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(postComments).values({ postId: input.postId, userId: ctx.user.id, content: input.content });
      return { success: true };
    }),
    react: protectedProcedure.input(z.object({ postId: z.number(), reaction: z.enum(["like", "love", "angry", "laugh", "dislike"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = (await db.select().from(postReactions).where(and(eq(postReactions.postId, input.postId), eq(postReactions.userId, ctx.user.id))).limit(1))[0];
      const reaction = nextReaction(existing?.reaction as "like" | "love" | "angry" | "laugh" | "dislike" | null, input.reaction);
      if (!reaction) await db.delete(postReactions).where(eq(postReactions.id, existing!.id));
      else if (existing) await db.update(postReactions).set({ reaction }).where(eq(postReactions.id, existing.id));
      else await db.insert(postReactions).values({ postId: input.postId, userId: ctx.user.id, reaction });
      return { reaction };
    }),
    share: protectedProcedure.input(z.object({ postId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(postShares).where(and(eq(postShares.postId, input.postId), eq(postShares.userId, ctx.user.id))).limit(1);
      const shared = nextShareState(Boolean(existing[0]));
      if (shared) await db.insert(postShares).values({ postId: input.postId, userId: ctx.user.id });
      return { shared };
    }),
  }),
  dm: router({
    conversations: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(conversations).where(or(eq(conversations.userOneId, ctx.user.id), eq(conversations.userTwoId, ctx.user.id))).orderBy(desc(conversations.updatedAt));
      return Promise.all(rows.map(async row => { const peerId = row.userOneId === ctx.user.id ? row.userTwoId : row.userOneId; const peer = await getUserById(peerId); const last = (await db.select({ createdAt: directMessages.createdAt }).from(directMessages).where(eq(directMessages.conversationId, row.id)).orderBy(desc(directMessages.createdAt)).limit(1))[0]; return { ...row, peer: peer ? { id: peer.id, name: peer.name, avatarUrl: peer.avatarUrl } : null, lastMessageAt: last?.createdAt ?? row.updatedAt }; }));
    }),
    start: protectedProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db || input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إنشاء محادثة مع الحساب نفسه." });
      const userOneId = Math.min(ctx.user.id, input.userId);
      const userTwoId = Math.max(ctx.user.id, input.userId);
      const existing = (await db.select().from(conversations).where(and(eq(conversations.userOneId, userOneId), eq(conversations.userTwoId, userTwoId))).limit(1))[0];
      if (existing) return existing;
      await db.insert(conversations).values({ userOneId, userTwoId });
      return (await db.select().from(conversations).where(and(eq(conversations.userOneId, userOneId), eq(conversations.userTwoId, userTwoId))).limit(1))[0];
    }),
    messages: protectedProcedure.input(z.object({ conversationId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conversation = (await db.select().from(conversations).where(and(eq(conversations.id, input.conversationId), or(eq(conversations.userOneId, ctx.user.id), eq(conversations.userTwoId, ctx.user.id)))).limit(1))[0];
      if (!conversation || !isConversationParticipant(conversation, ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية قراءة هذه المحادثة." });
      const rows = await db.select().from(directMessages).where(eq(directMessages.conversationId, input.conversationId)).orderBy(directMessages.createdAt).limit(100);
      return rows.map(row => ({ id: row.id, senderId: row.senderId, content: decryptMessage(row.ciphertext, row.iv, row.authTag), createdAt: row.createdAt, readAt: row.readAt }));
    }),
    send: protectedProcedure.input(z.object({ conversationId: z.number(), content: z.string().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conversation = (await db.select().from(conversations).where(and(eq(conversations.id, input.conversationId), or(eq(conversations.userOneId, ctx.user.id), eq(conversations.userTwoId, ctx.user.id)))).limit(1))[0];
      if (!conversation || !isConversationParticipant(conversation, ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الكتابة في هذه المحادثة." });
      await db.insert(directMessages).values({ conversationId: conversation.id, senderId: ctx.user.id, ...encryptMessage(input.content) });
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
      return { success: true };
    }),
  }),
  market: router({
    books: publicProcedure.query(() => listBooks()),
    booksAdvanced: publicProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional(), maxPoints: z.number().min(0).optional(), sort: z.enum(["title", "price", "recent"]).optional() }).optional()).query(({ input }) => listBooksAdvanced(input?.search, input?.category, input?.maxPoints, input?.sort)),
    cart: protectedProcedure.query(({ ctx }) => getCart(ctx.user.id)),
    addToCart: protectedProcedure.input(z.object({ bookId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const cart = await ensureCart(ctx.user.id);
      if (!db || !cart) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cart unavailable" });
      const existing = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.bookId, input.bookId))).limit(1);
      if (existing[0]) await db.update(cartItems).set({ quantity: sql`${cartItems.quantity} + 1` }).where(eq(cartItems.id, existing[0].id));
      else await db.insert(cartItems).values({ cartId: cart.id, bookId: input.bookId, quantity: 1 });
      return { success: true };
    }),
    removeFromCart: protectedProcedure.input(z.object({ itemId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const cart = await ensureCart(ctx.user.id);
      if (!db || !cart) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cart unavailable" });
      await db.delete(cartItems).where(and(eq(cartItems.id, input.itemId), eq(cartItems.cartId, cart.id)));
      return { success: true };
    }),
    checkout: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      const cart = await ensureCart(ctx.user.id);
      if (!db || !cart) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cart unavailable" });
      const rows = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
      if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "السلة فارغة." });
      const lineItems = await Promise.all(rows.map(async row => ({ row, book: (await db.select().from(books).where(eq(books.id, row.bookId)).limit(1))[0] })));
      if (lineItems.some(item => !item.book)) throw new TRPCError({ code: "NOT_FOUND", message: "يوجد كتاب لم يعد متاحًا." });
      const totalPoints = lineItems.reduce((sum, item) => sum + (item.book?.pricePoints ?? 0) * item.row.quantity, 0);
      const currentUser = await getUserById(ctx.user.id);
      if (!currentUser || currentUser.points < totalPoints) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `رصيدك غير كافٍ. تحتاج ${totalPoints} نقطة.` });
      return db.transaction(async tx => {
        const debit = await tx.update(users).set({ points: sql`${users.points} - ${totalPoints}` }).where(and(eq(users.id, ctx.user.id), sql`${users.points} >= ${totalPoints}`));
        const affectedRows = Number((debit as any)[0]?.affectedRows ?? (debit as any).affectedRows ?? 0);
        if (!isDebitSuccessful(affectedRows)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "تغير رصيدك أثناء إتمام الطلب. لم يتم إنشاء الطلب، حاول مرة أخرى." });
        const order = await tx.insert(pointOrders).values({ userId: ctx.user.id, totalPoints, status: "completed" });
        const orderId = Number(order[0]?.insertId ?? 0);
        if (!orderId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء رقم الطلب، لم يتم خصم النقاط." });
        await tx.insert(pointOrderItems).values(lineItems.map(item => ({ orderId, bookId: item.row.bookId, title: item.book!.title, quantity: item.row.quantity, unitPoints: item.book!.pricePoints })));
        await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
        const balanceRow = (await tx.select({ points: users.points }).from(users).where(eq(users.id, ctx.user.id)).limit(1))[0];
        return { success: true, orderId, totalPoints, remainingPoints: Number(balanceRow?.points ?? 0) };
      });
    }),
  }),
  malware: router({
    list: publicProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional() }).optional()).query(({ input }) => listMalware(input?.search, input?.category)),
    byId: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return undefined;
      return (await db.select().from(malwareFamilies).where(eq(malwareFamilies.id, input.id)).limit(1))[0];
    }),
  }),
  nvd: router({
    status: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { lastStatus: "unavailable", lastCompletedAt: null, lastImported: 0 };
      const row = (await db.select().from(nvdSyncSettings).limit(1))[0];
      return row ? { lastStatus: row.lastStatus, lastCompletedAt: row.lastCompletedAt, lastImported: row.lastImported } : { lastStatus: "never", lastCompletedAt: null, lastImported: 0 };
    }),
  }),
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(30);
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  ai: router({
    ask: protectedProcedure.input(z.object({ message: z.string().min(2).max(4000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(12).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [trackRows, courseRows, malwareRows, cveCount] = db ? await Promise.all([
        db.select({ title: tracks.title }).from(tracks).limit(12),
        db.select({ title: courses.title }).from(courses).where(eq(courses.isPublished, true)).limit(18),
        db.select({ name: malwareFamilies.name }).from(malwareFamilies).limit(12),
        db.select({ count: sql<number>`count(*)` }).from(cves),
      ]) : [[], [], [], [] as { count: number }[]];
      const currentUser = await getUserById(ctx.user.id);
      const platformContext = `بيانات CyberJocx المتاحة الآن: المسارات: ${trackRows.map(row => row.title).join(" | ") || "غير مفهرسة"}. الدورات: ${courseRows.map(row => row.title).join(" | ") || "غير مفهرسة"}. عائلات Malware المرصودة: ${malwareRows.map(row => row.name).join(" | ") || "غير مفهرسة"}. عدد سجلات CVE في المنصة: ${Number(cveCount[0]?.count ?? 0)}. المسار الأساسي للمستخدم: ${currentUser?.primaryTrackId ?? "لم يختر مسارًا بعد"}. لا تدّعِ الوصول إلى أي بيانات شخصية لمستخدمين آخرين.`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: `أنت NEXUS، مساعد تعلّم للأمن السيبراني داخل CyberJocx. أجب بالعربية الواضحة مع المصطلحات الإنجليزية عند الحاجة. ركّز على التعليم والدفاع والاختبار المصرح به، وارفض الإرشادات التي تسهّل اختراق أنظمة لا يملكها المستخدم. ابدأ بإجابة عملية مختصرة ثم اقترح خطوة تعلم تالية. ${platformContext}` },
          ...(input.history ?? []).map(item => ({ role: item.role, content: item.content })),
          { role: "user", content: input.message },
        ],
      });
      const content = response.choices?.[0]?.message?.content;
      return { answer: typeof content === "string" ? content : "تعذر توليد إجابة الآن. حاول مرة أخرى." };
    }),
    personalizeRoadmap: protectedProcedure.input(z.object({ trackId: z.number() })).mutation(async ({ ctx, input }) => {
      const roadmap = await getTrackRoadmap(ctx.user.id, input.trackId);
      if (!roadmap) throw new TRPCError({ code: "NOT_FOUND", message: "المسار غير موجود." });
      const outline = roadmap.levels.map(level => ({ title: level.title, requirements: level.requirements, modules: level.modules.map(module => module.title) }));
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "أنت NEXUS، مصمم مسارات تعلم في CyberJocx. أنشئ خطة عربية عملية وآمنة لتعلم مهارة أمن سيبراني. استخدم فقط المستويات والوحدات المعطاة، ولا تخترع شهادات أو فيديوهات أو تقنيات هجومية. اشرح: ما يبدأ به المستخدم الآن، ما ينجزه أسبوعيًا، وأدلة الجاهزية للانتقال للمستوى التالي. اجعل الناتج واضحًا بعناوين قصيرة وقوائم Markdown." },
          { role: "user", content: `المستخدم: ${ctx.user.name ?? "متعلم"}. المسار: ${roadmap.track.title}. المستوى الحالي: ${roadmap.currentLevel}. المنهج المتاح: ${JSON.stringify(outline)}` },
        ],
      });
      const content = response.choices?.[0]?.message?.content;
      return { roadmap: typeof content === "string" ? content : "تعذر تخصيص الخطة الآن. راجع الوحدات المتاحة ثم حاول مجددًا." };
    }),
  }),
  admin: router({
    content: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { courses: [], tools: [], cves: [], books: [], tracks: [], roadmaps: [], malware: [] };
      const [courseRows, toolRows, cveRows, bookRows, trackRows, roadmapRows, malwareRows] = await Promise.all([
        db.select({ id: courses.id, title: courses.title, category: courses.category }).from(courses).orderBy(desc(courses.createdAt)).limit(30),
        db.select({ id: tools.id, name: tools.name, category: tools.category }).from(tools).orderBy(tools.name).limit(30),
        db.select({ id: cves.id, cveNumber: cves.cveNumber, severity: cves.severity }).from(cves).orderBy(desc(cves.createdAt)).limit(30),
        db.select({ id: books.id, title: books.title, category: books.category }).from(books).orderBy(desc(books.createdAt)).limit(30),
        db.select({ id: tracks.id, title: tracks.title, slug: tracks.slug }).from(tracks).orderBy(desc(tracks.createdAt)).limit(30),
        db.select({ id: roadmaps.id, title: roadmaps.title, focus: roadmaps.focus }).from(roadmaps).orderBy(desc(roadmaps.createdAt)).limit(30),
        db.select({ id: malwareFamilies.id, name: malwareFamilies.name, category: malwareFamilies.category }).from(malwareFamilies).orderBy(desc(malwareFamilies.updatedAt)).limit(30),
      ]);
      return { courses: courseRows, tools: toolRows, cves: cveRows, books: bookRows, tracks: trackRows, roadmaps: roadmapRows, malware: malwareRows };
    }),
    deleteCourse: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(courses).where(eq(courses.id, input.id));
      return { success: true };
    }),
    deleteTool: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(tools).where(eq(tools.id, input.id));
      return { success: true };
    }),
    deleteCve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(cves).where(eq(cves.id, input.id));
      return { success: true };
    }),
    stats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { users: 0, courses: 0, cves: 0, tools: 0, posts: 0 };
      const [usersCount, coursesCount, cvesCount, toolsCount, postsCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(courses),
        db.select({ count: sql<number>`count(*)` }).from(cves),
        db.select({ count: sql<number>`count(*)` }).from(tools),
        db.select({ count: sql<number>`count(*)` }).from(posts),
      ]);
      return { users: Number(usersCount[0]?.count ?? 0), courses: Number(coursesCount[0]?.count ?? 0), cves: Number(cvesCount[0]?.count ?? 0), tools: Number(toolsCount[0]?.count ?? 0), posts: Number(postsCount[0]?.count ?? 0) };
    }),
    createCourse: adminProcedure.input(z.object({ title: z.string(), slug: z.string(), description: z.string(), category: z.string(), level: z.enum(["beginner", "intermediate", "advanced"]), instructor: z.string(), lessons: z.number(), durationMinutes: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(courses).values(input);
      const recipients = await db.select({ id: users.id }).from(users);
      if (recipients.length) await db.insert(notifications).values(recipients.map(recipient => ({ userId: recipient.id, type: "content" as const, title: "New learning node published", message: `${input.title} is now available in the learning matrix.` })));
      return { success: true };
    }),
    createTool: adminProcedure.input(z.object({ name: z.string(), category: z.string(), description: z.string(), commands: z.string().optional(), downloadUrl: z.string().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(tools).values(input);
      const recipients = await db.select({ id: users.id }).from(users);
      if (recipients.length) await db.insert(notifications).values(recipients.map(recipient => ({ userId: recipient.id, type: "content" as const, title: "Toolkit repository updated", message: `${input.name} has been added to the security toolkit.` })));
      return { success: true };
    }),
    createCve: adminProcedure.input(z.object({ cveNumber: z.string(), title: z.string(), description: z.string(), severity: z.enum(["critical", "high", "medium", "low"]), cvss: z.string(), publishedDate: z.string(), affected: z.string(), sourceUrl: z.string().optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(cves).values(input);
      if (input.severity === "critical" || input.severity === "high") {
        const recipients = await db.select({ id: users.id }).from(users);
        if (recipients.length) await db.insert(notifications).values(recipients.map(recipient => ({ userId: recipient.id, type: "cve" as const, title: `CVE ${input.severity.toUpperCase()} detected`, message: `${input.cveNumber}: ${input.title}` })));
      }
      return { success: true };
    }),
    users: adminProcedure.query(() => listAdminUsers()),
    geo: adminProcedure.query(() => getAdminGeoStats()),
    nvd: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { setting: null, runs: [] };
      const setting = (await db.select().from(nvdSyncSettings).limit(1))[0] ?? null;
      const runs = await db.select().from(nvdSyncRuns).orderBy(desc(nvdSyncRuns.startedAt)).limit(10);
      return { setting, runs };
    }),
    syncNvd: adminProcedure.mutation(async () => ({ success: true, ...(await syncRecentNvd()) })),
    updateUserRole: adminProcedure.input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),
    updateCourse: adminProcedure.input(z.object({ id: z.number(), title: z.string().min(2).optional(), description: z.string().min(2).optional(), category: z.string().min(2).optional(), isPublished: z.boolean().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(courses).set(changes).where(eq(courses.id, id)); return { success: true }; }),
    updateTool: adminProcedure.input(z.object({ id: z.number(), name: z.string().min(2).optional(), category: z.string().min(2).optional(), description: z.string().min(2).optional(), downloadUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(tools).set(changes).where(eq(tools.id, id)); return { success: true }; }),
    updateCve: adminProcedure.input(z.object({ id: z.number(), title: z.string().min(2).optional(), description: z.string().min(2).optional(), severity: z.enum(["critical", "high", "medium", "low"]).optional(), cvss: z.string().optional(), affected: z.string().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(cves).set(changes).where(eq(cves.id, id)); return { success: true }; }),
    updateBook: adminProcedure.input(z.object({ id: z.number(), title: z.string().min(2).optional(), author: z.string().min(2).optional(), category: z.string().min(2).optional(), description: z.string().min(2).optional(), pricePoints: z.number().min(0).optional(), coverUrl: z.string().url().optional(), downloadUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(books).set(changes).where(eq(books.id, id)); return { success: true }; }),
    updateTrack: adminProcedure.input(z.object({ id: z.number(), title: z.string().min(2).optional(), slug: z.string().min(2).optional(), description: z.string().min(2).optional(), outcome: z.string().min(2).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(tracks).set(changes).where(eq(tracks.id, id)); return { success: true }; }),
    updateRoadmap: adminProcedure.input(z.object({ id: z.number(), title: z.string().min(2).optional(), description: z.string().min(2).optional(), focus: z.string().min(2).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(roadmaps).set(changes).where(eq(roadmaps.id, id)); return { success: true }; }),
    updateMalware: adminProcedure.input(z.object({ id: z.number(), name: z.string().min(2).optional(), category: z.string().min(2).optional(), severity: z.enum(["critical", "high", "medium", "low"]).optional(), description: z.string().min(2).optional(), targets: z.string().min(2).optional(), mitreTechniques: z.string().min(2).optional(), sourceUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const { id, ...changes } = input; await db.update(malwareFamilies).set(changes).where(eq(malwareFamilies.id, id)); return { success: true }; }),
    createBook: adminProcedure.input(z.object({ title: z.string().min(2), author: z.string().min(2), category: z.string().min(2), description: z.string().min(2), pricePoints: z.number().min(0), coverUrl: z.string().url().optional(), downloadUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.insert(books).values(input); return { success: true }; }),
    deleteBook: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.delete(books).where(eq(books.id, input.id)); return { success: true }; }),
    createTrack: adminProcedure.input(z.object({ title: z.string().min(2), slug: z.string().min(2), description: z.string().min(2), outcome: z.string().min(2) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.insert(tracks).values(input); return { success: true }; }),
    deleteTrack: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.delete(tracks).where(eq(tracks.id, input.id)); return { success: true }; }),
    createRoadmap: adminProcedure.input(z.object({ title: z.string().min(2), description: z.string().min(2), focus: z.string().min(2) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.insert(roadmaps).values(input); return { success: true }; }),
    deleteRoadmap: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.delete(roadmaps).where(eq(roadmaps.id, input.id)); return { success: true }; }),
    createMalware: adminProcedure.input(z.object({ name: z.string().min(2), category: z.string().min(2), severity: z.enum(["critical", "high", "medium", "low"]), description: z.string().min(2), targets: z.string().min(2), mitreTechniques: z.string().min(2), sourceUrl: z.string().url().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.insert(malwareFamilies).values(input); return { success: true }; }),
    deleteMalware: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.delete(malwareFamilies).where(eq(malwareFamilies.id, input.id)); return { success: true }; }),
    messages: adminProcedure.input(z.object({ conversationId: z.number() })).query(async ({ input }) => { const db = await getDb(); if (!db) return []; const rows = await db.select().from(directMessages).where(eq(directMessages.conversationId, input.conversationId)).orderBy(directMessages.createdAt).limit(200); return rows.map(row => ({ id: row.id, senderId: row.senderId, content: decryptMessage(row.ciphertext, row.iv, row.authTag), createdAt: row.createdAt })); }),
  }),
});

export type AppRouter = typeof appRouter;
