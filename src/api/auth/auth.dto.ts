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

export type ValidateEmailDto = {
  token: string;
};

export type ResetPasswordDto = {
  token: string;
  password: string;
};

export type ResendValidationEmailDto = {
  mail: string;
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

export function parseValidateEmailBody(body: unknown): ValidateEmailDto {
  const obj = asObject(body);
  const token = getString(obj.token);

  if (!token)
    throw badRequest('Token is required', 'AUTH_EMAIL_VALIDATION_MISSING_TOKEN');

  return { token };
}

export function parseResetPasswordBody(body: unknown): ResetPasswordDto {
  const obj = asObject(body);
  const token = getString(obj.token);
  const rawPassword = typeof obj.password === 'string' ? obj.password : obj.newPassword;
  const password = typeof rawPassword === 'string' ? rawPassword : '';

  if (!token)
    throw badRequest('Token is required', 'AUTH_RESET_PASSWORD_MISSING_TOKEN');

  return { token, password };
}

export function parseResendValidationEmailBody(body: unknown): ResendValidationEmailDto {
  const obj = asObject(body);
  const mail = getString(obj.mail).toLowerCase();

  if (!mail)
    throw badRequest('Email is required', 'AUTH_VALIDATION_RESEND_MISSING_EMAIL');
  if (!mail.includes('@'))
    throw badRequest('Invalid email', 'AUTH_INVALID_EMAIL');

  return { mail };
}
