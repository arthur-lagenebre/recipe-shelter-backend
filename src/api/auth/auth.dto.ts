import { badRequest } from '../../utils/errors.js';

export type RegisterDto = {
  mail: string;
  username: string;
  password: string;
};

export type LoginDto = {
  mail: string;
  password: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseRegisterBody(body: unknown): RegisterDto {
  const obj = asObject(body);

  const mail = getString(obj.mail).toLowerCase();
  const username = getString(obj.username);
  const password = getString(obj.password);

  if (!mail || !username || !password)
    throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');
  if (!mail.includes('@'))
    throw badRequest('Invalid email', 'AUTH_INVALID_EMAIL');
  if (username.length < 3)
    throw badRequest('Username too short', 'AUTH_WEAK_USERNAME');
  if (password.length < 8)
    throw badRequest('Password must be at least 8 characters', 'AUTH_WEAK_PASSWORD');

  return { mail, username, password };
}

export function parseLoginBody(body: unknown): LoginDto {
  const obj = asObject(body);

  const mail = getString(obj.mail).toLowerCase();
  const password = getString(obj.password);

  if (!mail || !password)
    throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

  return { mail, password };
}