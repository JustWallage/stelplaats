import { describe, expect, it } from "vitest";
import {
  buildPushRequest,
  buildVapidAuthHeader,
  deriveEcdhSecret,
  encryptPayload,
  exportRawKey,
  generateKeyPair,
  importVapidKeys,
} from "./push-crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      key,
      length * 8,
    ),
  );
}

async function exportJwk(key: CryptoKey): Promise<JsonWebKey> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (jwk instanceof ArrayBuffer) {
    throw new Error("Expected a JWK");
  }
  return jwk;
}

async function makeVapid(): Promise<{
  publicKey: string;
  privateScalar: string;
  verifyKey: CryptoKey;
}> {
  const pair = await generateKeyPair({ name: "ECDSA", namedCurve: "P-256" }, [
    "sign",
    "verify",
  ]);
  const rawPublic = await exportRawKey(pair.publicKey);
  const jwk = await exportJwk(pair.privateKey);
  return {
    publicKey: bytesToBase64Url(rawPublic),
    privateScalar: jwk.d ?? "",
    verifyKey: pair.publicKey,
  };
}

// A stand-in for the browser's subscription key pair, so the test can decrypt
// what the worker encrypted.
async function makeSubscriptionKeys(): Promise<{
  keys: { p256dh: string; auth: string };
  privateKey: CryptoKey;
  authSecret: Uint8Array;
}> {
  const pair = await generateKeyPair({ name: "ECDH", namedCurve: "P-256" }, [
    "deriveBits",
  ]);
  const rawPublic = await exportRawKey(pair.publicKey);
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    keys: {
      p256dh: bytesToBase64Url(rawPublic),
      auth: bytesToBase64Url(authSecret),
    },
    privateKey: pair.privateKey,
    authSecret,
  };
}

describe("buildVapidAuthHeader", () => {
  it("produces a JWT that verifies against the public key with the right claims", async () => {
    const vapid = await makeVapid();
    const keys = await importVapidKeys(
      vapid.publicKey,
      vapid.privateScalar,
      "mailto:test@example.com",
    );
    const header = await buildVapidAuthHeader(
      keys,
      "https://push.example.com",
      new Date("2026-06-29T00:00:00Z"),
    );

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, jwt, advertisedKey] = match ?? [];
    expect(advertisedKey).toBe(vapid.publicKey);

    const [headerB64, payloadB64, signatureB64] = (jwt ?? "").split(".");
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.verifyKey,
      base64UrlToBytes(signatureB64 ?? ""),
      encoder.encode(`${headerB64}.${payloadB64}`),
    );
    expect(valid).toBe(true);

    const claims: unknown = JSON.parse(
      decoder.decode(base64UrlToBytes(payloadB64 ?? "")),
    );
    expect(claims).toMatchObject({
      aud: "https://push.example.com",
      sub: "mailto:test@example.com",
    });
  });
});

describe("encryptPayload", () => {
  it("encrypts a payload the subscription can decrypt (RFC 8291 round-trip)", async () => {
    const subscription = await makeSubscriptionKeys();
    const payload = encoder.encode(
      JSON.stringify({ title: "Water the ferns", body: "Due today" }),
    );

    const body = await encryptPayload(payload, subscription.keys);

    // Parse the aes128gcm header: salt(16) | rs(4) | idlen(1) | keyid(idlen).
    const salt = body.slice(0, 16);
    const idlen = body[20] ?? 0;
    const asPublicBytes = body.slice(21, 21 + idlen);
    const ciphertext = body.slice(21 + idlen);

    const asPublicKey = await crypto.subtle.importKey(
      "raw",
      asPublicBytes,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const ecdhSecret = await deriveEcdhSecret(
      subscription.privateKey,
      asPublicKey,
    );
    const uaPublicBytes = base64UrlToBytes(subscription.keys.p256dh);
    const keyInfo = new Uint8Array([
      ...encoder.encode("WebPush: info\0"),
      ...uaPublicBytes,
      ...asPublicBytes,
    ]);
    const ikm = await hkdf(ecdhSecret, subscription.authSecret, keyInfo, 32);
    const cek = await hkdf(
      ikm,
      salt,
      encoder.encode("Content-Encoding: aes128gcm\0"),
      16,
    );
    const nonce = await hkdf(
      ikm,
      salt,
      encoder.encode("Content-Encoding: nonce\0"),
      12,
    );
    const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
      "decrypt",
    ]);
    const decrypted = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce, tagLength: 128 },
        aesKey,
        ciphertext,
      ),
    );

    // Trailing 0x02 is the single-record delimiter.
    expect(decrypted[decrypted.length - 1]).toBe(2);
    expect(decoder.decode(decrypted.slice(0, -1))).toBe(
      decoder.decode(payload),
    );
  });
});

describe("buildPushRequest", () => {
  it("targets the endpoint with the VAPID header and an encrypted body", async () => {
    const vapid = await makeVapid();
    const keys = await importVapidKeys(
      vapid.publicKey,
      vapid.privateScalar,
      "mailto:test@example.com",
    );
    const subscription = await makeSubscriptionKeys();
    const request = await buildPushRequest(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: subscription.keys,
      },
      encoder.encode("hello"),
      keys,
      new Date("2026-06-29T00:00:00Z"),
    );

    expect(request.url).toBe("https://fcm.googleapis.com/fcm/send/abc123");
    expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(request.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(request.body.length).toBeGreaterThan(100);
  });
});
