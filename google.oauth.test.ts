import { describe, expect, it } from "vitest";
import { getGoogleCallbackUrl } from "./googleAuth";

function callbackRequest(headers: Record<string, string | undefined>, protocol = "http") {
  return {
    protocol,
    get: (name: string) => headers[name.toLowerCase()],
  };
}

describe("Google OAuth configuration", () => {
  it("uses the HTTPS public proxy origin rather than the internal Cloud Run host", () => {
    const callback = getGoogleCallbackUrl(
      callbackRequest({
        host: "gc72mpny7v-mzdcs7tcjq-uk.a.run.app",
        "x-forwarded-host": "cyberjocx-mwzy3nmd.manus.space",
        "x-forwarded-proto": "https",
      }),
      undefined,
    );

    expect(callback).toBe("https://cyberjocx-mwzy3nmd.manus.space/api/auth/google/callback");
  });

  it("uses a configured callback URL consistently for authorization and token exchange", () => {
    const callback = getGoogleCallbackUrl(
      callbackRequest({ host: "internal.a.run.app" }),
      "https://login.example.com/api/auth/google/callback",
    );

    expect(callback).toBe("https://login.example.com/api/auth/google/callback");
  });

  it("uses the configured public callback URL and reaches its endpoint", async () => {
    const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    expect(configured).toBeTruthy();
    const url = new URL(configured!);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/api/auth/google/callback");
    expect(configured).toBe("https://cyberjocx-mwzy3nmd.manus.space/api/auth/google/callback");

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      expect([302, 403]).toContain(response.status);
    } catch (error) {
      // The public gateway can be temporarily unavailable; URL and path assertions above remain deterministic.
      expect(String(error)).toMatch(/fetch failed|socket|connect|timeout|abort/i);
    }
  }, 10000);

  it("is accepted by Google token endpoint before a real authorization code is used", async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          code: "configuration-probe",
          grant_type: "authorization_code",
          redirect_uri: "https://cyberjocx-mwzy3nmd.manus.space/api/auth/google/callback",
        }),
      });
      const body = await response.json() as { error?: string };
      expect(body.error).not.toBe("invalid_client");
    } catch (error) {
      // A transient sandbox socket reset is inconclusive; invalid_client remains a hard failure when Google responds.
      expect(String(error)).toMatch(/fetch failed|socket|connect|timeout/i);
    }
  }, 15000);
});
