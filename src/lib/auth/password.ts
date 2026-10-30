import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { z } from "zod";

/** Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations). */
const OPTIONS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Use a mix of letters and numbers.");

/** Readable temporary password for admin-created accounts and resets. */
export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  // Guarantee at least one digit and one letter for the password policy.
  return `${out.slice(0, 6)}-${out.slice(6, 12)}-${(bytes[12] % 8) + 2}${alphabet[bytes[13] % 24]}`;
}
