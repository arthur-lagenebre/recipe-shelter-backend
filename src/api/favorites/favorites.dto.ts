import { badRequest } from '../../utils/errors.js';
import { getRequiredNumber } from '../http/dto.helpers.js';

export type FavoriteBody = {
    userId: number;
    recipeId: number;
};

export function parseCreateFavoriteBody(body: unknown): FavoriteBody {
    return parseFavoriteBody(body, 'FAVORITES_CREATE');
}

export function parseDeleteFavoriteBody(body: unknown): FavoriteBody {
    return parseFavoriteBody(body, 'FAVORITES_DELETE');
}

function parseFavoriteBody(body: unknown, codePrefix: 'FAVORITES_CREATE' | 'FAVORITES_DELETE'): FavoriteBody {
    if (!isRecord(body))
        throw badRequest('Invalid body', `${codePrefix}_BAD_BODY`);

    const userId = getRequiredNumber(body.userId, 'User must be a number', `${codePrefix}_BAD_USER`);
    const recipeId = getRequiredNumber(body.recipeId, 'Recipe must be a number', `${codePrefix}_BAD_RECIPE`);

    return { userId, recipeId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
