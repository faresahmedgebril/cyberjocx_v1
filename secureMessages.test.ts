import { afterEach, describe, expect, it } from "vitest";
import { decryptMessage, encryptMessage } from "./secureMessages";

describe("secure direct messages", () => {
  const originalSecret = process.env.JWT_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it("encrypts and decrypts a message without storing plaintext", () => {
    process.env.JWT_SECRET = "test-secret-for-cyberjocx";
    const encrypted = encryptMessage("رسالة خاصة لا تظهر للعامة");
    expect(encrypted.ciphertext).not.toContain("رسالة");
    expect(decryptMessage(encrypted.ciphertext, encrypted.iv, encrypted.authTag)).toBe("رسالة خاصة لا تظهر للعامة");
  });

  it("rejects a tampered ciphertext", () => {
    process.env.JWT_SECRET = "test-secret-for-cyberjocx";
    const encrypted = encryptMessage("integrity check");
    const tampered = `${encrypted.ciphertext.slice(0, -2)}AA`;
    expect(() => decryptMessage(tampered, encrypted.iv, encrypted.authTag)).toThrow();
  });
});
