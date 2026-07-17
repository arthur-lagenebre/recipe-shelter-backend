import { badRequest } from '../../utils/errors.js';

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

export type RegisterDto = {
  mail: string;
  username: string;
  password: string;
};

export type LoginDto = {
  mail: string;
  password: string;
};

export type StaffLoginVerificationDto = {
  flowId: string;
  credential: AuthenticationResponseJSON;
};

export type StaffMfaEnrollmentOptionsDto = {
  invitationToken: string;
};

export type StaffInvitationActivationDto = StaffMfaEnrollmentOptionsDto & {
  flowId: string;
  password: string;
  credential: RegistrationResponseJSON;
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

export function parseStaffLoginVerificationBody(body: unknown): StaffLoginVerificationDto {
  const obj = asObject(body);
  const flowId = getString(obj.flowId);

  if (!flowId)
    throw badRequest('MFA flow ID is required', 'AUTH_MFA_FLOW_REQUIRED');

  return { flowId, credential: parseAuthenticationCredential(obj.credential) };
}

export function parseStaffMfaEnrollmentOptionsBody(body: unknown): StaffMfaEnrollmentOptionsDto {
  const obj = asObject(body);
  const invitationToken = getString(obj.invitationToken);

  if (!invitationToken)
    throw badRequest('Invitation token is required', 'STAFF_MFA_INVITATION_TOKEN_REQUIRED');

  return { invitationToken };
}

export function parseStaffInvitationActivationBody(invitationTokenParam: unknown, body: unknown): StaffInvitationActivationDto {
  const obj = asObject(body);
  const invitationToken = getString(invitationTokenParam);
  const flowId = getString(obj.flowId);
  const password = typeof obj.password === 'string' ? obj.password : '';

  if (!invitationToken)
    throw badRequest('Invitation token is required', 'STAFF_MFA_INVITATION_TOKEN_REQUIRED');
  if (!flowId)
    throw badRequest('MFA flow ID is required', 'AUTH_MFA_FLOW_REQUIRED');
  if (!password)
    throw badRequest('Password is required', 'AUTH_MISSING_FIELDS');

  return {
    flowId,
    invitationToken,
    password,
    credential: parseRegistrationCredential(obj.credential)
  };
}

function parseCredentialBase(value: unknown): Record<string, unknown> {
  const credential = asObject(value);
  const response = asObject(credential.response);

  if (typeof credential.id !== 'string'
    || typeof credential.rawId !== 'string'
    || credential.type !== 'public-key'
    || typeof credential.clientExtensionResults !== 'object'
    || credential.clientExtensionResults === null
    || typeof response.clientDataJSON !== 'string') {
    throw badRequest('Invalid WebAuthn response', 'AUTH_INVALID_WEBAUTHN_RESPONSE');
  }

  return credential;
}

function parseAuthenticationCredential(value: unknown): AuthenticationResponseJSON {
  const credential = parseCredentialBase(value);
  const response = asObject(credential.response);

  if (typeof response.authenticatorData !== 'string'
    || typeof response.signature !== 'string'
    || (response.userHandle !== undefined && typeof response.userHandle !== 'string')) {
    throw badRequest('Invalid WebAuthn authentication response', 'AUTH_INVALID_WEBAUTHN_RESPONSE');
  }

  return credential as unknown as AuthenticationResponseJSON;
}

function parseRegistrationCredential(value: unknown): RegistrationResponseJSON {
  const credential = parseCredentialBase(value);
  const response = asObject(credential.response);

  if (typeof response.attestationObject !== 'string')
    throw badRequest('Invalid WebAuthn registration response', 'AUTH_INVALID_WEBAUTHN_RESPONSE');

  return credential as unknown as RegistrationResponseJSON;
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
