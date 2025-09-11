import { createHash, randomBytes } from 'crypto';
import argon2 from 'argon2';

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function hashPhone(raw: string): string {
  const normalized = normalizePhone(raw);
  return createHash('sha256').update(normalized).digest('hex');
}

export async function hashPassword(raw: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2.hash(raw, { type: argon2.argon2id, salt });
}

export async function verifyPassword(raw: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, raw);
  } catch {
    return false;
  }
}


