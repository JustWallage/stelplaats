// Generates a VAPID key pair for Web Push. Run once, then store the values:
//   node scripts/generate-vapid.mjs
// - VAPID_PUBLIC_KEY  : public key (also exposed to the browser to subscribe)
// - VAPID_PRIVATE_KEY : private scalar `d` (secret — never commit)
// - VAPID_SUBJECT     : a contact `mailto:` (set yourself)
// In production these are wrangler secrets synced from GitHub secrets (see
// .github/workflows/deploy.yml); locally they go in .dev.vars.
import { webcrypto } from "node:crypto";

const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");

const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const rawPublic = new Uint8Array(
  await webcrypto.subtle.exportKey("raw", pair.publicKey),
);
const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

console.log("VAPID_PUBLIC_KEY=" + toBase64Url(rawPublic));
console.log("VAPID_PRIVATE_KEY=" + jwk.d);
console.log("VAPID_SUBJECT=mailto:you@example.com");
