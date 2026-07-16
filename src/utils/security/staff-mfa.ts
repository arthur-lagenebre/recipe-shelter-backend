import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ENCRYPTION_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;

function readEncryptionKey(encodedKey: string | undefined): Buffer {
  if (!encodedKey)
    throw new Error('AUTH_STAFF_MFA_ENCRYPTION_KEY is required for staff MFA');

  const key = /^[a-f\d]{64}$/i.test(encodedKey)
    ? Buffer.from(encodedKey, 'hex')
    : Buffer.from(encodedKey, 'base64');

  if (key.length !== 32)
    throw new Error('AUTH_STAFF_MFA_ENCRYPTION_KEY must encode exactly 32 bytes');

  return key;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/[\s=-]/g, '');
  let bits = '';

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0)
      throw new Error('Invalid TOTP secret');
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8)
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));

  if (!bytes.length)
    throw new Error('Invalid TOTP secret');

  return Buffer.from(bytes);
}

function generateTotp(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

export function encryptStaffMfaSecret(secret: string, encodedKey: string | undefined): Buffer {
  const key = readEncryptionKey(encodedKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return Buffer.concat([
    Buffer.from([ENCRYPTION_VERSION]),
    iv,
    cipher.getAuthTag(),
    encrypted
  ]);
}

export function decryptStaffMfaSecret(payload: Buffer, encodedKey: string | undefined): string {
  if (payload.length <= 1 + IV_LENGTH + AUTH_TAG_LENGTH || payload[0] !== ENCRYPTION_VERSION)
    throw new Error('Invalid encrypted staff MFA secret');

  const key = readEncryptionKey(encodedKey);
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function verifyTotpCode(secret: string, code: string, now = new Date(), window = 1): boolean {
  if (!/^\d{6}$/.test(code) || !Number.isInteger(window) || window < 0)
    return false;

  const counter = Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
  const received = Buffer.from(code);

  for (let drift = -window; drift <= window; drift += 1) {
    const driftedCounter = counter + drift;
    if (driftedCounter < 0)
      continue;
    const expected = Buffer.from(generateTotp(secret, driftedCounter));
    if (expected.length === received.length && timingSafeEqual(expected, received))
      return true;
  }

  return false;
}
