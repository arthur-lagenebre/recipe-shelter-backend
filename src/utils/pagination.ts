import { badRequest } from './errors.js';

export type PaginationOptions = {
    page: number;
    limit: number;
    offset: number;
};

export type PaginationMetadata = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

export type PaginatedResult<T> = {
    items: T[];
    pagination: PaginationMetadata;
};

const MAX_LIMIT = 50;

export function parsePaginationQuery(query: unknown, defaultLimit: number, codePrefix = 'PAGINATION'): PaginationOptions {
    if (typeof query !== 'object' || query === null)
        throw badRequest('Invalid query', `${codePrefix}_BAD_QUERY`);

    const queryRecord = query as Record<string, unknown>;
    const page = parseOptionalPositiveIntegerQueryValue(queryRecord.page, 1, 'Page must be a positive integer', `${codePrefix}_BAD_PAGE`);
    const requestedLimit = parseOptionalPositiveIntegerQueryValue(
        queryRecord.limit,
        defaultLimit,
        'Limit must be a positive integer',
        `${codePrefix}_BAD_LIMIT`
    );
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

export function createPaginatedResult<T>(items: T[], totalItems: number, pagination: PaginationOptions): PaginatedResult<T> {
    const totalPages = Math.ceil(totalItems / pagination.limit);

    return {
        items,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            totalItems,
            totalPages,
            hasNextPage: pagination.page < totalPages,
            hasPreviousPage: pagination.page > 1
        }
    };
}

export function formatLimitOffsetClause(pagination: PaginationOptions): string {
    const limit = requireSqlInteger(pagination.limit, 1, 'Limit must be a positive integer', 'PAGINATION_BAD_LIMIT');
    const offset = requireSqlInteger(pagination.offset, 0, 'Offset must be a non-negative integer', 'PAGINATION_BAD_OFFSET');

    return `LIMIT ${limit} OFFSET ${offset}`;
}

function parseOptionalPositiveIntegerQueryValue(value: unknown, defaultValue: number, message: string, code: string): number {
    if (value === undefined)
        return defaultValue;

    if (typeof value !== 'string')
        throw badRequest(message, code);

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0)
        throw badRequest(message, code);

    return parsedValue;
}

function requireSqlInteger(value: number, min: number, message: string, code: string): number {
    if (!Number.isSafeInteger(value) || value < min)
        throw badRequest(message, code);

    return value;
}
