import 'dotenv/config';

function readNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim())
    return fallback;

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
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
const jwtExpiresIn = readString(process.env.JWT_EXPIRES_IN, '7d');
const defaultSessionCookieMaxAgeMs = readDurationMs(jwtExpiresIn, 604800000);

export const env = {
  nodeEnv,
  port: readNumber(process.env.PORT, 3000),

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
    defaultRoleName: readString(process.env.AUTH_DEFAULT_ROLE_NAME, 'user'),
    bcryptCost: readNumber(process.env.BCRYPT_COST, 12),
    rateLimitMaxAttempts: readNumber(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 5),
    rateLimitWindowMs: readNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 900000) // 15 minutes
  },

  smtp: {
    host: readString(process.env.SMTP_HOST, ''),
    port: readNumber(process.env.SMTP_PORT, 587),
    secure: readBoolean(process.env.SMTP_SECURE, false),
    user: readString(process.env.SMTP_USER, ''),
    password: readString(process.env.SMTP_PASSWORD, ''),
    from: readString(process.env.SMTP_FROM, ''),
    contactRecipientEmail: readString(process.env.CONTACT_RECIPIENT_EMAIL, '')
  }
};
