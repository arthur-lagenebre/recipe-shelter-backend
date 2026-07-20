import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from '../../services/admin/admin.audit.events.js';
import { badRequest } from '../../utils/errors.js';
import { isRecord } from '../http/dto.helpers.js';

import type { AdminAuditLogFilters } from '../../repositories/admin/admin.audit-query.types.js';
import type { AdminAuditEventType, AdminAuditTargetType } from '../../services/admin/admin.audit.events.js';

const ACTIONS = new Set<string>(Object.values(ADMIN_AUDIT_EVENT_TYPES));
const TARGET_TYPES = new Set<string>(Object.values(ADMIN_AUDIT_TARGET_TYPES));
const TARGET_ID_MAX_LENGTH = 255;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseAdminAuditLogFilters(query: unknown): AdminAuditLogFilters {
  if (!isRecord(query))
    throw badRequest('Invalid audit log query', 'ADMIN_AUDIT_LOGS_BAD_QUERY');

  const actorUserId = parseOptionalPositiveInteger(query.actorUserId);
  const action = parseOptionalAction(query.action);
  const targetType = parseOptionalTargetType(query.targetType);
  const targetId = parseOptionalTargetId(query.targetId);
  const from = parseOptionalInstant(query.from, 'from', 'ADMIN_AUDIT_LOGS_BAD_FROM');
  const to = parseOptionalInstant(query.to, 'to', 'ADMIN_AUDIT_LOGS_BAD_TO');
  const correlationId = parseOptionalCorrelationId(query.correlationId);

  if (from && to && from.getTime() > to.getTime())
    throw badRequest('Audit log period start must not be after its end', 'ADMIN_AUDIT_LOGS_BAD_PERIOD');

  return compactFilters({ actorUserId, action, targetType, targetId, from, to, correlationId });
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined)
    return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    throw badRequest('Actor user id must be a positive integer', 'ADMIN_AUDIT_LOGS_BAD_ACTOR');

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw badRequest('Actor user id must be a positive integer', 'ADMIN_AUDIT_LOGS_BAD_ACTOR');

  return parsed;
}

function parseOptionalAction(value: unknown): AdminAuditEventType | undefined {
  const normalized = parseOptionalNonBlankString(value, 'Action must be an audit event code', 'ADMIN_AUDIT_LOGS_BAD_ACTION');

  if (normalized === undefined)
    return undefined;
  if (!ACTIONS.has(normalized))
    throw badRequest('Action must be an audit event code', 'ADMIN_AUDIT_LOGS_BAD_ACTION');

  return normalized as AdminAuditEventType;
}

function parseOptionalTargetType(value: unknown): AdminAuditTargetType | undefined {
  const normalized = parseOptionalNonBlankString(value, 'Target type must be an audit target code', 'ADMIN_AUDIT_LOGS_BAD_TARGET_TYPE');

  if (normalized === undefined)
    return undefined;
  if (!TARGET_TYPES.has(normalized))
    throw badRequest('Target type must be an audit target code', 'ADMIN_AUDIT_LOGS_BAD_TARGET_TYPE');

  return normalized as AdminAuditTargetType;
}

function parseOptionalTargetId(value: unknown): string | undefined {
  const normalized = parseOptionalNonBlankString(value, 'Target id must be a non-empty string', 'ADMIN_AUDIT_LOGS_BAD_TARGET_ID');

  if (normalized && normalized.length > TARGET_ID_MAX_LENGTH)
    throw badRequest(`Target id must be at most ${TARGET_ID_MAX_LENGTH} characters`, 'ADMIN_AUDIT_LOGS_BAD_TARGET_ID');

  return normalized;
}

function parseOptionalInstant(value: unknown, name: string, code: string): Date | undefined {
  const normalized = parseOptionalNonBlankString(value, `${name} must be an ISO 8601 instant`, code);

  if (normalized === undefined)
    return undefined;
  if (!ISO_INSTANT_PATTERN.test(normalized))
    throw badRequest(`${name} must be an ISO 8601 instant`, code);

  const instant = new Date(normalized);
  if (Number.isNaN(instant.getTime()))
    throw badRequest(`${name} must be an ISO 8601 instant`, code);

  return instant;
}

function parseOptionalCorrelationId(value: unknown): string | undefined {
  const normalized = parseOptionalNonBlankString(value, 'Correlation id must be a UUID', 'ADMIN_AUDIT_LOGS_BAD_CORRELATION_ID');

  if (normalized === undefined)
    return undefined;
  if (!UUID_PATTERN.test(normalized))
    throw badRequest('Correlation id must be a UUID', 'ADMIN_AUDIT_LOGS_BAD_CORRELATION_ID');

  return normalized.toLowerCase();
}

function parseOptionalNonBlankString(value: unknown, message: string, code: string): string | undefined {
  if (value === undefined)
    return undefined;
  if (typeof value !== 'string')
    throw badRequest(message, code);

  const normalized = value.trim();
  if (!normalized)
    throw badRequest(message, code);

  return normalized;
}

function compactFilters(filters: { actorUserId: number | undefined; action: AdminAuditEventType | undefined; targetType: AdminAuditTargetType | undefined; targetId: string | undefined; from: Date | undefined; to: Date | undefined; correlationId: string | undefined; }): AdminAuditLogFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)) as AdminAuditLogFilters;
}
