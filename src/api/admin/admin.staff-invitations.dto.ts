import { badRequest } from '../../utils/errors.js';
import { normalizeEmail } from '../../utils/string.js';
import { isRecord } from '../http/dto.helpers.js';

import type { CreateStaffInvitationCommand } from '../../services/admin/admin.staff-invitation.service.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MIN_DISPLAY_NAME_LENGTH = 3;
const MAX_DISPLAY_NAME_LENGTH = 64;
const MAX_ROLE_COUNT = 20;
const MAX_ROLE_CODE_LENGTH = 64;

export function parseCreateStaffInvitationBody(body: unknown): CreateStaffInvitationCommand {
  if (!isRecord(body))
    throw badRequest('Invalid body', 'STAFF_INVITATION_BAD_BODY');

  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

  if (!email)
    throw badRequest('Email is required', 'STAFF_INVITATION_EMAIL_REQUIRED');
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))
    throw badRequest('Invalid email', 'STAFF_INVITATION_EMAIL_INVALID');
  if (!displayName)
    throw badRequest('Display name is required', 'STAFF_INVITATION_DISPLAY_NAME_REQUIRED');
  if (displayName.length < MIN_DISPLAY_NAME_LENGTH)
    throw badRequest('Display name is too short', 'STAFF_INVITATION_DISPLAY_NAME_TOO_SHORT');
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH)
    throw badRequest('Display name is too long', 'STAFF_INVITATION_DISPLAY_NAME_TOO_LONG');
  if (!Array.isArray(body.roles) || body.roles.length === 0)
    throw badRequest('At least one initial role is required', 'STAFF_INVITATION_ROLES_REQUIRED');
  if (body.roles.length > MAX_ROLE_COUNT)
    throw badRequest('Too many initial roles', 'STAFF_INVITATION_ROLES_INVALID');

  const roles = body.roles.map((role) => typeof role === 'string' ? role.trim() : '');
  if (roles.some((role) => !role || role.length > MAX_ROLE_CODE_LENGTH))
    throw badRequest('Invalid initial role code', 'STAFF_INVITATION_ROLES_INVALID');
  if (new Set(roles).size !== roles.length)
    throw badRequest('Initial role codes must be unique', 'STAFF_INVITATION_ROLES_DUPLICATE');

  return { email, displayName, roles };
}
