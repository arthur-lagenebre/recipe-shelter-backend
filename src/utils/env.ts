import 'dotenv/config';

function readNumber(value: string | undefined, fallback: number): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function readString(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

export const env = {
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
    jwtExpiresIn: readString(process.env.JWT_EXPIRES_IN, '7d'),
    defaultRoleName: readString(process.env.AUTH_DEFAULT_ROLE_NAME, 'user'),
    bcryptCost: readNumber(process.env.BCRYPT_COST, 12)
  }
};