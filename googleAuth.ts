import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const GOOGLE_STATE_COOKIE = "cyberjocx_google_state";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function firstForwardedValue(value: string | undefined) {
  return value?.split(",")[0]?.trim();
}

/**
 * OAuth must use the browser-facing origin. On the production platform the
 * direct Host header belongs to the Cloud Run container, while the public
 * HTTPS domain is supplied by the reverse proxy in forwarded headers.
 */
export function getGoogleCallbackUrl(req: Pick<Request, "protocol" | "get">, configuredRedirect = process.env.GOOGLE_OAUTH_REDIRECT_URI) {
  if (configuredRedirect) return configuredRedirect;

  const protocol = firstForwardedValue(req.get("x-forwarded-proto")) ?? req.protocol;
  const host = firstForwardedValue(req.get("x-forwarded-host")) ?? req.get("host");
  if (!host) throw new Error("Google OAuth callback host is unavailable");
  return `${protocol}://${host}/api/auth/google/callback`;
}

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return { clientId, clientSecret };
}

export function registerGoogleAuthRoutes(app: Express) {
  app.get("/api/auth/google/login", (req: Request, res: Response) => {
    try {
      const { clientId } = config();
      const state = crypto.randomUUID();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(GOOGLE_STATE_COOKIE, state, { ...cookieOptions, httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
      const url = new URL(GOOGLE_AUTHORIZE_URL);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", getGoogleCallbackUrl(req));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("state", state);
      url.searchParams.set("prompt", "select_account");
      res.redirect(302, url.toString());
    } catch {
      res.status(503).send("Google sign-in is not configured yet.");
    }
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const cookieState = parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE];
    if (!code || !state || state !== cookieState) {
      res.status(403).send("Google sign-in verification failed. Please try again.");
      return;
    }
    res.clearCookie(GOOGLE_STATE_COOKIE, { ...getSessionCookieOptions(req), sameSite: "lax" });
    try {
      const { clientId, clientSecret } = config();
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: getGoogleCallbackUrl(req), grant_type: "authorization_code" }),
      });
      if (!tokenResponse.ok) throw new Error("Google token exchange failed");
      const tokens = await tokenResponse.json() as { access_token?: string };
      if (!tokens.access_token) throw new Error("Google access token missing");
      const userResponse = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!userResponse.ok) throw new Error("Google user profile request failed");
      const googleUser = await userResponse.json() as { sub?: string; email?: string; name?: string; given_name?: string; family_name?: string; picture?: string; locale?: string; email_verified?: boolean };
      if (!googleUser.sub || !googleUser.email_verified) throw new Error("Google account must have a verified email");
      const openId = `google:${googleUser.sub}`;
      await db.upsertUser({ openId, name: googleUser.name ?? null, email: googleUser.email ?? null, avatarUrl: googleUser.picture ?? null, googleGivenName: googleUser.given_name ?? null, googleFamilyName: googleUser.family_name ?? null, googleLocale: googleUser.locale ?? null, loginMethod: "google", lastSignedIn: new Date() });
      const sessionToken = await sdk.signSession({ openId, appId: "cyberjocx", name: googleUser.name ?? googleUser.email ?? "CyberJocx User" }, { expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/?auth=success");
    } catch (error) {
      console.error("[Google OAuth] callback failed", error);
      res.redirect(302, "/?authError=google");
    }
  });
}
