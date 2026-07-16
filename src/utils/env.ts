import 'dotenv/config';
import path from 'node:path';

function readNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim())
    return fallback;

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const number = readNumber(value, fallback);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue)
    return fallback;

  if (['1', 'true', 'yes', 'on'].includes(normalizedValue))
    return true;

  if (['0', 'false', 'no', 'off'].includes(normalizedValue))
    return false;

  return fallback;
}

function readString(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function readImageStorageDriver(value: string | undefined): 'local' | 's3' {
  const driver = readString(value, 'local').toLowerCase();

  if (driver === 'local' || driver === 's3')
    return driver;

  throw new Error(`Unknown IMAGE_STORAGE_DRIVER: ${driver}`);
}

function requireImageStorageValue(name: string, value: string | undefined, driver: 'local' | 's3'): string {
  const normalized = value?.trim();

  if (driver === 's3' && !normalized)
    throw new Error(`${name} is required when IMAGE_STORAGE_DRIVER=s3`);

  return normalized ?? '';
}

function readSameSite(value: string | undefined, fallback: 'strict' | 'lax' | 'none'): 'strict' | 'lax' | 'none' {
  const normalizedValue = value?.trim().toLowerCase();

  if (normalizedValue === 'strict' || normalizedValue === 'lax' || normalizedValue === 'none')
    return normalizedValue;

  return fallback;
}

function readDurationMs(value: string, fallback: number): number {
  const match = value.trim().match(/^(\d+)(ms|s|m|h|d)?$/i);

  if (!match)
    return fallback;

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? 's';
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };
  const multiplier = multipliers[unit];

  if (!Number.isFinite(amount) || !multiplier)
    return fallback;

  return amount * multiplier;
}

const nodeEnv = readString(process.env.NODE_ENV, 'development');
const port = readNumber(process.env.PORT, 3000);
const jwtExpiresIn = readString(process.env.JWT_EXPIRES_IN, '7d');
const defaultSessionCookieMaxAgeMs = readDurationMs(jwtExpiresIn, 604800000);
const imageStorageDriver = readImageStorageDriver(process.env.IMAGE_STORAGE_DRIVER);
const imagePublicBaseUrl = imageStorageDriver === 's3'
  ? requireImageStorageValue('IMAGE_PUBLIC_BASE_URL', process.env.IMAGE_PUBLIC_BASE_URL, imageStorageDriver)
  : readString(process.env.IMAGE_PUBLIC_BASE_URL, `http://localhost:${port}/media`);

export const env = {
  nodeEnv,
  port,

  http: {
    corsAllowedOrigins: readString(process.env.CORS_ALLOWED_ORIGINS, 'http://localhost:4200,http://127.0.0.1:4200'),
    frontendBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:4200'
  },

  db: {
    host: readString(process.env.DB_HOST, '127.0.0.1'),
    port: readNumber(process.env.DB_PORT, 3306),
    user: readString(process.env.DB_USER, 'root'),
    password: readString(process.env.DB_PASSWORD, ''),
    name: readString(process.env.DB_NAME, 'recipe_shelter'),
    connectionLimit: readNumber(process.env.DB_CONNECTION_LIMIT, 10)
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET is required'); })(),
    jwtExpiresIn,
    sessionCookieName: readString(process.env.AUTH_SESSION_COOKIE_NAME, 'rs_session'),
    sessionCookieDomain: readOptionalString(process.env.AUTH_SESSION_COOKIE_DOMAIN),
    sessionCookieSameSite: readSameSite(process.env.AUTH_SESSION_COOKIE_SAME_SITE, 'lax'),
    sessionCookieSecure: readBoolean(process.env.AUTH_SESSION_COOKIE_SECURE, nodeEnv === 'production'),
    sessionCookieMaxAgeMs: readNumber(process.env.AUTH_SESSION_COOKIE_MAX_AGE_MS, defaultSessionCookieMaxAgeMs),
    bcryptCost: readNumber(process.env.BCRYPT_COST, 12),
    rateLimitMaxAttempts: readNumber(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 5),
    rateLimitWindowMs: readNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 900000) // 15 minutes
  },

  bootstrap: {
    superAdminInvitationTtlMinutes: readPositiveInteger(process.env.BOOTSTRAP_SUPER_ADMIN_INVITATION_TTL_MINUTES, 30)
  },

  smtp: {
    host: readString(process.env.SMTP_HOST, ''),
    port: readNumber(process.env.SMTP_PORT, 587),
    secure: readBoolean(process.env.SMTP_SECURE, false),
    user: readString(process.env.SMTP_USER, ''),
    password: readString(process.env.SMTP_PASSWORD, ''),
    from: readString(process.env.SMTP_FROM, ''),
    contactRecipientEmail: readString(process.env.CONTACT_RECIPIENT_EMAIL, '')
  },

  imageStorage: {
    driver: imageStorageDriver,
    localRoot: path.resolve(process.cwd(), readString(process.env.IMAGE_LOCAL_ROOT, './var/uploads')),
    publicBaseUrl: imagePublicBaseUrl,
    s3: {
      endpoint: requireImageStorageValue('IMAGE_S3_ENDPOINT', process.env.IMAGE_S3_ENDPOINT, imageStorageDriver),
      region: readString(process.env.IMAGE_S3_REGION, 'auto'),
      bucket: requireImageStorageValue('IMAGE_S3_BUCKET', process.env.IMAGE_S3_BUCKET, imageStorageDriver),
      accessKeyId: requireImageStorageValue('IMAGE_S3_ACCESS_KEY_ID', process.env.IMAGE_S3_ACCESS_KEY_ID, imageStorageDriver),
      secretAccessKey: requireImageStorageValue('IMAGE_S3_SECRET_ACCESS_KEY', process.env.IMAGE_S3_SECRET_ACCESS_KEY, imageStorageDriver)
    }
  }
};
