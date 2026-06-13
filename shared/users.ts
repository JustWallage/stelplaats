import { z } from "zod";

// The two real people who use Stelplaats. doneBy/author are stored as emails;
// the UI shows the friendly name. Unknown emails (local dev, e2e) fall back to
// the raw email rather than being rejected on display.
export const KNOWN_USERS = [
  { email: "just@wallage.nl", name: "Just" },
  { email: "suusraedts2018@gmail.com", name: "Suus" },
] as const;

export const userEmailSchema = z.enum([
  "just@wallage.nl",
  "suusraedts2018@gmail.com",
]);

export function displayName(email: string): string {
  return KNOWN_USERS.find((user) => user.email === email)?.name ?? email;
}
