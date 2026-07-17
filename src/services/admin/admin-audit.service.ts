import { randomUUID } from 'node:crypto';

import { ADMIN_AUDIT_EVENT_TARGET_TYPES, ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES, type AdminAuditEventType, type AdminAuditTargetType } from './admin-audit.events.js';
import { internalError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

import type { AdminAuditJsonValue, AdminAuditRepository, AdminAuditSnapshot, CreateAdminAuditLogInput } from '../../repositories/admin/admin-audit.repository.interface.js';

const TARGET_ID_MAX_LENGTH = 255;
const REASON_MAX_LENGTH = 65_535;
const IP_ADDRESS_MAX_LENGTH = 45;
const USER_AGENT_MAX_LENGTH = 512;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_FIELD_NAMES = new Set(['apikey', 'authorization', 'cookie', 'privatekey']);
const SENSITIVE_FIELD_FRAGMENTS = ['credential', 'password', 'secret', 'token'];
const EVENT_TYPES = new Set<string>(Object.values(ADMIN_AUDIT_EVENT_TYPES));
const TARGET_TYPES = new Set<string>(Object.values(ADMIN_AUDIT_TARGET_TYPES));

export const ADMIN_AUDIT_FAILURE_POLICY = 'fail-closed' as const;

export type AdminAuditRecordInput = {
  actorUserId: number;
  eventType: AdminAuditEventType;
  targetType: AdminAuditTargetType;
  targetId: number | string;
  reason?: string | null;
  beforeValues?: AdminAuditSnapshot | null;
  afterValues?: AdminAuditSnapshot | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string;
};

export type AdminAuditRecordReceipt = {
  id: number;
  correlationId: string;
};

export class AdminAuditService {
  constructor(private readonly auditLogs: AdminAuditRepository, private readonly createCorrelationId: () => string = randomUUID) { }

  async record(input: AdminAuditRecordInput): Promise<AdminAuditRecordReceipt> {
    let correlationId: string | undefined;

    try {
      correlationId = normalizeCorrelationId(input.correlationId ?? this.createCorrelationId());
      const event = normalizeInput(input, correlationId);
      const id = await this.auditLogs.create(event);

      return { id, correlationId };
    } catch (error) {
      logger.error('[audit] Mandatory administrative audit record failed', {
        actorUserId: Number.isSafeInteger(input.actorUserId) ? input.actorUserId : undefined,
        eventType: safeLogValue(input.eventType),
        targetType: safeLogValue(input.targetType),
        targetId: safeLogValue(input.targetId),
        correlationId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        policy: ADMIN_AUDIT_FAILURE_POLICY
      });

      throw internalError(
        'Administrative action could not be audited',
        'ADMIN_AUDIT_RECORD_FAILED'
      );
    }
  }
}

function normalizeInput(input: AdminAuditRecordInput, correlationId: string): CreateAdminAuditLogInput {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0)
    throw new TypeError('actorUserId must be a positive safe integer');
  if (!EVENT_TYPES.has(input.eventType))
    throw new TypeError('eventType must be part of the administrative audit catalog');
  if (!TARGET_TYPES.has(input.targetType))
    throw new TypeError('targetType must be part of the administrative audit catalog');
  if (ADMIN_AUDIT_EVENT_TARGET_TYPES[input.eventType] !== input.targetType)
    throw new TypeError('targetType does not match eventType');

  return {
    actorUserId: input.actorUserId,
    action: input.eventType,
    targetType: input.targetType,
    targetId: normalizeTargetId(input.targetId),
    reason: normalizeOptionalText(input.reason, REASON_MAX_LENGTH, 'reason'),
    beforeValues: sanitizeSnapshot(input.beforeValues, 'beforeValues'),
    afterValues: sanitizeSnapshot(input.afterValues, 'afterValues'),
    ipAddress: normalizeOptionalText(input.ipAddress, IP_ADDRESS_MAX_LENGTH, 'ipAddress'),
    userAgent: normalizeOptionalText(input.userAgent, USER_AGENT_MAX_LENGTH, 'userAgent'),
    correlationId
  };
}

function normalizeTargetId(targetId: number | string): string {
  if (typeof targetId === 'number' && (!Number.isSafeInteger(targetId) || targetId <= 0))
    throw new TypeError('numeric targetId must be a positive safe integer');

  const normalized = String(targetId).trim();
  if (!normalized)
    throw new TypeError('targetId is required');
  if (normalized.length > TARGET_ID_MAX_LENGTH)
    throw new TypeError(`targetId must be at most ${TARGET_ID_MAX_LENGTH} characters`);

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number, fieldName: string): string | null {
  if (value === null || value === undefined)
    return null;

  const normalized = value.trim();
  if (!normalized)
    throw new TypeError(`${fieldName} cannot be blank`);
  if (normalized.length > maxLength)
    throw new TypeError(`${fieldName} must be at most ${maxLength} characters`);

  return normalized;
}

function normalizeCorrelationId(value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized))
    throw new TypeError('correlationId must be a UUID');

  return normalized.toLowerCase();
}

function sanitizeSnapshot(snapshot: AdminAuditSnapshot | null | undefined, fieldName: string): AdminAuditSnapshot | null {
  if (snapshot === null || snapshot === undefined)
    return null;
  if (!isPlainObject(snapshot))
    throw new TypeError(`${fieldName} must be a plain JSON object`);

  return sanitizeObject(snapshot, new WeakSet<object>(), fieldName);
}

function sanitizeObject(value: Readonly<Record<string, AdminAuditJsonValue>>, ancestors: WeakSet<object>, fieldName: string): AdminAuditSnapshot {
  if (ancestors.has(value))
    throw new TypeError(`${fieldName} must not contain circular references`);

  ancestors.add(value);
  const sanitized: Record<string, AdminAuditJsonValue> = {};

  for (const [key, child] of Object.entries(value)) {
    sanitized[key] = isSensitiveFieldName(key)
      ? REDACTED_VALUE
      : sanitizeJsonValue(child, ancestors, `${fieldName}.${key}`);
  }

  ancestors.delete(value);
  return sanitized;
}

function sanitizeJsonValue(value: AdminAuditJsonValue, ancestors: WeakSet<object>, fieldName: string): AdminAuditJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${fieldName} must contain only finite numbers`);
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value))
      throw new TypeError(`${fieldName} must not contain circular references`);

    ancestors.add(value);
    const sanitized = value.map((child, index) => sanitizeJsonValue(child, ancestors, `${fieldName}[${index}]`));
    ancestors.delete(value);
    return sanitized;
  }
  if (isPlainObject(value))
    return sanitizeObject(value, ancestors, fieldName);

  throw new TypeError(`${fieldName} must contain only JSON values`);
}

function isPlainObject(value: unknown): value is Record<string, AdminAuditJsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSensitiveFieldName(fieldName: string): boolean {
  const normalized = fieldName.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_FIELD_NAMES.has(normalized)
    || SENSITIVE_FIELD_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function safeLogValue(value: unknown): string | number | undefined {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string')
    return undefined;

  return value.slice(0, 255);
}
