import type { PushSubscriptionInput } from "../../shared/api";

// Web Push wire format, implemented with Web Crypto only (no Node deps, runs in
// workerd): VAPID request signing (RFC 8292) + aes128gcm payload encryption
// (RFC 8291 / RFC 8188). The push service decrypts with the subscription's
// private key; we never see it.

const VAPID_TTL_SECONDS = 12 * 60 * 60;
const PUSH_TTL_SECONDS = 28 * 24 * 60 * 60;
const RECORD_SIZE = 4096;

const encoder = new TextEncoder();

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

// `crypto.subtle.generateKey` is typed to return `CryptoKey | CryptoKeyPair`;
// for asymmetric algorithms it is always a pair. Narrows without an `as` cast.
export async function generateKeyPair(
  algorithm: SubtleCryptoGenerateKeyAlgorithm,
  usages: string[],
): Promise<CryptoKeyPair> {
  const key = await crypto.subtle.generateKey(algorithm, true, usages);
  if (!("privateKey" in key)) {
    throw new Error("Expected a key pair");
  }
  return key;
}

// `exportKey` is typed `Promise<ArrayBuffer | JsonWebKey>`; narrow the raw form.
export async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  throw new Error("Expected raw key bytes");
}

// workerd's ECDH expects the peer key under `public`, but the Cloudflare types
// name it `$public`. Passing a typed variable (not an inline literal) keeps
// `public` on the runtime object while satisfying SubtleCryptoDeriveKeyAlgorithm.
interface EcdhDeriveParams {
  name: string;
  public: CryptoKey;
}

export async function deriveEcdhSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array> {
  const params: EcdhDeriveParams = { name: "ECDH", public: publicKey };
  return new Uint8Array(
    await crypto.subtle.deriveBits(params, privateKey, 256),
  );
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// The VAPID application-server key pair: the raw public key (sent to the browser
// and echoed in the Authorization header) plus the imported private key used to
// sign the JWT.
export interface VapidKeys {
  publicKey: string;
  privateKey: CryptoKey;
  subject: string;
}

// Reconstruct the signing key from the stored raw public key (65-byte
// uncompressed point) and the private scalar `d`. x/y come from the public
// point, so only those two secrets need storing.
export async function importVapidKeys(
  publicKey: string,
  privateScalar: string,
  subject: string,
): Promise<VapidKeys> {
  const publicBytes = base64UrlToBytes(publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
    d: privateScalar,
    ext: true,
  };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { publicKey, privateKey, subject };
}

// `vapid t=<jwt>, k=<public key>` — the JWT proves we hold the private key for
// the advertised public key; the push service binds the subscription to it.
export async function buildVapidAuthHeader(
  keys: VapidKeys,
  audience: string,
  now: Date,
): Promise<string> {
  const header = bytesToBase64Url(
    encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now.getTime() / 1000) + VAPID_TTL_SECONDS,
        sub: keys.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    encoder.encode(signingInput),
  );
  const jwt = `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
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
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// Encrypt `payload` for a subscription using aes128gcm. The output is the full
// HTTP body: a header carrying the salt + our ephemeral public key, followed by
// the AES-GCM ciphertext. `randomBytes`/`ephemeralKeyPair` are injectable so a
// test can pin them and decrypt deterministically.
export async function encryptPayload(
  payload: Uint8Array,
  subscriptionKeys: PushSubscriptionInput["keys"],
  options?: { salt?: Uint8Array; keyPair?: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlToBytes(subscriptionKeys.p256dh);
  const authSecret = base64UrlToBytes(subscriptionKeys.auth);
  const salt = options?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const keyPair =
    options?.keyPair ??
    (await generateKeyPair({ name: "ECDH", namedCurve: "P-256" }, [
      "deriveBits",
    ]));
  const asPublicBytes = await exportRawKey(keyPair.publicKey);

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = await deriveEcdhSecret(keyPair.privateKey, uaPublicKey);

  // RFC 8291 §3.4: derive the input keying material from the shared secret,
  // keyed by the subscription's auth secret and bound to both public keys.
  const keyInfo = concatBytes(
    encoder.encode("WebPush: info\0"),
    uaPublicBytes,
    asPublicBytes,
  );
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);

  // RFC 8188 §2.1: content-encryption key and nonce from the per-message salt.
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
    "encrypt",
  ]);
  // Single record: payload followed by the 0x02 last-record delimiter.
  const plaintext = concatBytes(payload, Uint8Array.of(2));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      plaintext,
    ),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);
  const header = concatBytes(
    salt,
    recordSize,
    Uint8Array.of(asPublicBytes.length),
    asPublicBytes,
  );
  return concatBytes(header, ciphertext);
}

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

// Assemble everything needed to POST one notification to a subscription.
export async function buildPushRequest(
  subscription: PushSubscriptionInput,
  payload: Uint8Array,
  keys: VapidKeys,
  now: Date,
): Promise<PushRequest> {
  const audience = new URL(subscription.endpoint).origin;
  const authorization = await buildVapidAuthHeader(keys, audience, now);
  const body = await encryptPayload(payload, subscription.keys);
  return {
    url: subscription.endpoint,
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(PUSH_TTL_SECONDS),
    },
    body,
  };
}
