import { badRequest } from '../../utils/errors.js';
import { isRecord } from '../http/dto.helpers.js';

import type { AdminTagListFilters } from '../../repositories/admin/admin.tags.types.js';
import type { TagStatus } from '../../repositories/tag/tag.types.js';
import type { AdminCreateTagCommand, AdminMergeTagCommand, AdminUpdateTagCommand } from '../../services/admin/admin.tags.service.js';

const TAG_STATUSES = new Set<TagStatus>(['active', 'deprecated', 'merged']);
const TAG_NAME_MAX_LENGTH = 255;
const TAG_SLUG_MAX_LENGTH = 255;
const TAG_DESCRIPTION_MAX_LENGTH = 1000;
const TAG_SEARCH_MAX_LENGTH = 255;
const ACTION_REASON_MIN_LENGTH = 10;
const ACTION_REASON_MAX_LENGTH = 1000;
const TAG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseAdminTagIdParam(value: unknown): number {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
        throw badRequest('Tag id must be a positive integer', 'ADMIN_TAGS_BAD_ID');

    const id = Number(value);
    if (!Number.isSafeInteger(id))
        throw badRequest('Tag id must be a positive integer', 'ADMIN_TAGS_BAD_ID');

    return id;
}

export function parseAdminTagListFilters(query: unknown): AdminTagListFilters {
    if (!isRecord(query) || Array.isArray(query))
        throw badRequest('Invalid tag query', 'ADMIN_TAGS_BAD_QUERY');

    const status = parseOptionalStatus(query.status);
    const groupId = parseOptionalQueryId(query.groupId);
    const q = parseOptionalSearch(query.q);

    return {
        ...(status === undefined ? {} : { status }),
        ...(groupId === undefined ? {} : { groupId }),
        ...(q === undefined ? {} : { q })
    };
}

export function parseCreateAdminTagBody(body: unknown): AdminCreateTagCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid tag body', 'ADMIN_TAGS_CREATE_BAD_BODY');

    const groupId = parseBodyId(body.groupId, 'Tag group id', 'ADMIN_TAGS_BAD_GROUP_ID');
    const name = parseRequiredName(body.name);
    const slug = parseOptionalSlug(body.slug);
    const description = parseOptionalDescription(body.description);

    return {
        groupId,
        name,
        ...(slug === undefined ? {} : { slug }),
        ...(description === undefined ? {} : { description })
    };
}

export function parseUpdateAdminTagBody(body: unknown): AdminUpdateTagCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid tag body', 'ADMIN_TAGS_UPDATE_BAD_BODY');

    const groupId = body.groupId === undefined ? undefined : parseBodyId(body.groupId, 'Tag group id', 'ADMIN_TAGS_BAD_GROUP_ID');
    const name = body.name === undefined ? undefined : parseRequiredName(body.name);
    const slug = parseOptionalSlug(body.slug);
    const description = parseOptionalDescription(body.description);

    if (groupId === undefined && name === undefined && slug === undefined && description === undefined)
        throw badRequest('At least one tag field must be provided', 'ADMIN_TAGS_UPDATE_EMPTY');

    return {
        ...(groupId === undefined ? {} : { groupId }),
        ...(name === undefined ? {} : { name }),
        ...(slug === undefined ? {} : { slug }),
        ...(description === undefined ? {} : { description })
    };
}

export function parseAdminTagActionReasonBody(body: unknown, action: 'deprecate' | 'restore'): string {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid tag action body', `ADMIN_TAGS_${action.toUpperCase()}_BAD_BODY`);

    return parseReason(body.reason, action);
}

export function parseMergeAdminTagBody(body: unknown): AdminMergeTagCommand {
    if (!isRecord(body) || Array.isArray(body))
        throw badRequest('Invalid tag merge body', 'ADMIN_TAGS_MERGE_BAD_BODY');

    return {
        targetTagId: parseBodyId(body.targetTagId, 'Merge target tag id', 'ADMIN_TAGS_MERGE_BAD_TARGET_ID'),
        reason: parseReason(body.reason, 'merge')
    };
}

function parseOptionalStatus(value: unknown): TagStatus | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !TAG_STATUSES.has(value as TagStatus))
        throw badRequest('Tag status must be active, deprecated or merged', 'ADMIN_TAGS_BAD_STATUS');

    return value as TagStatus;
}

function parseOptionalQueryId(value: unknown): number | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
        throw badRequest('Tag group id must be a positive integer', 'ADMIN_TAGS_BAD_GROUP_ID');

    const id = Number(value);
    if (!Number.isSafeInteger(id))
        throw badRequest('Tag group id must be a positive integer', 'ADMIN_TAGS_BAD_GROUP_ID');

    return id;
}

function parseOptionalSearch(value: unknown): string | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw badRequest('Tag search must be a non-empty string', 'ADMIN_TAGS_BAD_SEARCH');

    const q = value.trim();
    if (!q || q.length > TAG_SEARCH_MAX_LENGTH)
        throw badRequest(`Tag search must contain at most ${TAG_SEARCH_MAX_LENGTH} characters`, 'ADMIN_TAGS_BAD_SEARCH');

    return q;
}

function parseBodyId(value: unknown, label: string, code: string): number {
    if (!Number.isSafeInteger(value) || Number(value) <= 0)
        throw badRequest(`${label} must be a positive integer`, code);

    return Number(value);
}

function parseRequiredName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';

    if (!name)
        throw badRequest('Tag name is required', 'ADMIN_TAGS_NAME_REQUIRED');
    if (name.length > TAG_NAME_MAX_LENGTH)
        throw badRequest(`Tag name must be at most ${TAG_NAME_MAX_LENGTH} characters`, 'ADMIN_TAGS_NAME_TOO_LONG');

    return name;
}

function parseOptionalSlug(value: unknown): string | undefined {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw badRequest('Tag slug is invalid', 'ADMIN_TAGS_SLUG_INVALID');

    const slug = value.trim();
    if (!slug || slug.length > TAG_SLUG_MAX_LENGTH || !TAG_SLUG_PATTERN.test(slug))
        throw badRequest('Tag slug must contain lowercase letters, numbers and single hyphens', 'ADMIN_TAGS_SLUG_INVALID');

    return slug;
}

function parseOptionalDescription(value: unknown): string | null | undefined {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (typeof value !== 'string')
        throw badRequest('Tag description must be a string or null', 'ADMIN_TAGS_DESCRIPTION_INVALID');

    const description = value.trim();
    if (!description)
        throw badRequest('Tag description cannot be blank', 'ADMIN_TAGS_DESCRIPTION_INVALID');
    if (description.length > TAG_DESCRIPTION_MAX_LENGTH)
        throw badRequest(`Tag description must be at most ${TAG_DESCRIPTION_MAX_LENGTH} characters`, 'ADMIN_TAGS_DESCRIPTION_TOO_LONG');

    return description;
}

function parseReason(value: unknown, action: 'deprecate' | 'restore' | 'merge'): string {
    const reason = typeof value === 'string' ? value.trim() : '';
    const codePrefix = `ADMIN_TAGS_${action.toUpperCase()}`;

    if (!reason)
        throw badRequest('Action reason is required', `${codePrefix}_REASON_REQUIRED`);
    if (reason.length < ACTION_REASON_MIN_LENGTH)
        throw badRequest(`Action reason must be at least ${ACTION_REASON_MIN_LENGTH} characters`, `${codePrefix}_REASON_TOO_SHORT`);
    if (reason.length > ACTION_REASON_MAX_LENGTH)
        throw badRequest(`Action reason must be at most ${ACTION_REASON_MAX_LENGTH} characters`, `${codePrefix}_REASON_TOO_LONG`);

    return reason;
}
