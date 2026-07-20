import { badRequest } from "../../utils/errors.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function getRequiredString(value: unknown, message: string, code: string): string {
    const result = typeof value === 'string' ? value.trim() : '';

    if (!result)
        throw badRequest(message, code);

    return result;
}

export function getOptionalString(value: unknown, message: string, code: string): string | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (typeof value !== 'string')
        throw badRequest(message, code);

    return value.trim();
}

export function getOptionalNullableString(value: unknown, message: string, code: string): string | null | undefined {
    if (value === undefined)
        return undefined;

    if (value === null)
        return null;

    if (typeof value !== 'string')
        throw badRequest(message, code);

    return value.trim();
}

export function getOptionalNumber(value: unknown, message: string, code: string): number | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (typeof value !== 'number' || !Number.isFinite(value))
        throw badRequest(message, code);

    return value;
}

export function getOptionalNullableNumber(value: unknown, message: string, code: string): number | null | undefined {
    if (value === undefined)
        return undefined;

    if (value === null)
        return null;

    if (typeof value !== 'number' || !Number.isFinite(value))
        throw badRequest(message, code);

    return value;
}

export function getRequiredNumber(value: unknown, message: string, code: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw badRequest(message, code);

    return value;
}

export function getRequiredPositiveInteger(value: unknown, message: string, code: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
        throw badRequest(message, code);

    return value;
}

export function getOptionalArray<T>(value: unknown, parser: (item: unknown, index: number) => T, message: string, code: string): T[] | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (!Array.isArray(value))
        throw badRequest(message, code);

    return value.map(parser);
}

export function getBoundedInteger(value: unknown, min: number, max: number, message: string, code: string): number | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
        throw badRequest(message, code);

    return value;
}

export function getBoundedNullableInteger(value: unknown, min: number, max: number, message: string, code: string): number | null | undefined {
    if (value === undefined)
        return undefined;

    if (value === null)
        return null;

    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
        throw badRequest(message, code);

    return value;
}

export function getBoundedNullableNumber(value: unknown, min: number, max: number, message: string, code: string): number | null | undefined {
    if (value === undefined)
        return undefined;

    if (value === null)
        return null;

    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        throw badRequest(message, code);

    return value;
}

export function getBoundedString(value: unknown, minLength: number, maxLength: number, message: string, code: string): string | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (typeof value !== 'string')
        throw badRequest(message, code);

    const result = value.trim();
    const length = Array.from(result).length;

    if (length < minLength || length > maxLength)
        throw badRequest(message, code);

    return result;
}

export function getRequiredBoundedString(value: unknown, minLength: number, maxLength: number, message: string, code: string): string {
    const result = typeof value === 'string' ? value.trim() : '';

    if (!result)
        throw badRequest(message, code);

    const length = Array.from(result).length;
    if (length < minLength || length > maxLength)
        throw badRequest(message, code);

    return result;
}

export function getBoundedArray<T>(value: unknown, maxLength: number, parser: (item: unknown, index: number) => T, message: string, code: string): T[] | undefined {
    if (value === undefined || value === null)
        return undefined;

    if (!Array.isArray(value))
        throw badRequest(message, code);

    if (value.length > maxLength)
        throw badRequest(message, code);

    return value.map(parser);
}