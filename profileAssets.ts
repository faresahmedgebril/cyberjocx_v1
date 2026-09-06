export type ProfileAssetUpload = {
  contentType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  extension: "pdf" | "png" | "jpg" | "webp";
  bytes: Buffer;
};

export function parseProfileAssetDataUrl(dataUrl?: string): ProfileAssetUpload | null {
  if (!dataUrl) return null;
  const match = /^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("INVALID_PROFILE_ASSET_DATA_URL");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("PROFILE_ASSET_TOO_LARGE");
  const contentType = match[1] as ProfileAssetUpload["contentType"];
  const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] as "png" | "webp";
  return { contentType, extension, bytes };
}

export function canViewProfileAsset(isOwner: boolean, isPublic: boolean) {
  return isOwner || isPublic;
}
