import "server-only";

import bcrypt from "bcryptjs";

const ROUNDS = 12;

/** Passwords are stored as bcrypt hashes; plaintext never reaches the database. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
