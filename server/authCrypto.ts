import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function deriveKey(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) return false;
  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await deriveKey(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function secureEqual(left: string, right: string): boolean {
  return safeEqual(Buffer.from(left), Buffer.from(right));
}

export function encodeBase32(input: Buffer): string {
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return output;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 value');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function createTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpAt(secret: string, timestamp: number, period = 30): { code: string; counter: number } {
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = ((digest[offset] ?? 0) & 0x7f) << 24
    | ((digest[offset + 1] ?? 0) & 0xff) << 16
    | ((digest[offset + 2] ?? 0) & 0xff) << 8
    | ((digest[offset + 3] ?? 0) & 0xff);
  return { code: String(binary % 1_000_000).padStart(6, '0'), counter };
}

export function verifyTotp(secret: string, code: string, timestamp: number, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = totpAt(secret, timestamp + offset * 30_000);
    if (safeEqual(Buffer.from(candidate.code), Buffer.from(code))) return candidate.counter;
  }
  return null;
}

export function authenticatorUri(secret: string, username = 'admin'): string {
  const label = encodeURIComponent(`DarkCraft:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=DarkCraft&algorithm=SHA1&digits=6&period=30`;
}
