import { describe, expect, it } from "vitest";
import { canViewProfileAsset, parseProfileAssetDataUrl } from "./profileAssets";

describe("profile asset uploads", () => {
  it("parses supported PDF metadata and bytes", () => {
    const upload = parseProfileAssetDataUrl("data:application/pdf;base64,JVBERi0xLjQ=");
    expect(upload).toMatchObject({ contentType: "application/pdf", extension: "pdf" });
    expect(upload?.bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects unsupported asset types and protects private assets", () => {
    expect(() => parseProfileAssetDataUrl("data:text/plain;base64,SGVsbG8=" )).toThrow("INVALID_PROFILE_ASSET_DATA_URL");
    expect(canViewProfileAsset(true, false)).toBe(true);
    expect(canViewProfileAsset(false, true)).toBe(true);
    expect(canViewProfileAsset(false, false)).toBe(false);
  });
});
