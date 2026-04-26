import { badRequest } from '../../utils/errors.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function parseRejectRecipeBody(body: unknown): string {
    if (!isRecord(body))
        throw badRequest('Invalid body', 'ADMIN_RECIPES_REJECT_BAD_BODY');

    const rejectionReason = typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : '';

    if (!rejectionReason)
        throw badRequest('Rejection reason is required', 'ADMIN_RECIPES_REJECT_MISSING_REASON');

    return rejectionReason;
}
