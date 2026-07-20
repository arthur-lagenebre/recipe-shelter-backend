import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseArchiveRecipeBody, parseRejectRecipeBody } from '../../../src/api/admin/admin.recipes.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('admin.recipes.dto', () => {
    it('parses and trims a rejection reason', () => {
        assert.equal(parseRejectRecipeBody({ reason: '  Missing preparation details.  ' }), 'Missing preparation details.');
    });

    it('rejects invalid rejection bodies', () => {
        assert.throws(
            () => parseRejectRecipeBody(null),
            (error) => {
                assertHttpError(error, 'ADMIN_RECIPES_REJECT_BAD_BODY', 400);
                return true;
            }
        );

        assert.throws(
            () => parseRejectRecipeBody({ reason: '   ' }),
            (error) => {
                assertHttpError(error, 'ADMIN_RECIPES_REJECT_MISSING_REASON', 400);
                return true;
            }
        );
    });

    it('requires bounded reasons for rejection and administrative archive', () => {
        assert.equal(parseArchiveRecipeBody({ reason: '  Repeated policy violations.  ' }), 'Repeated policy violations.');

        for (const [parser, codePrefix] of [
            [parseRejectRecipeBody, 'ADMIN_RECIPES_REJECT'],
            [parseArchiveRecipeBody, 'ADMIN_RECIPES_ARCHIVE']
        ] as const) {
            assert.throws(
                () => parser({ reason: 'short' }),
                (error) => {
                    assertHttpError(error, `${codePrefix}_REASON_TOO_SHORT`, 400);
                    return true;
                }
            );
            assert.throws(
                () => parser({ reason: 'x'.repeat(1001) }),
                (error) => {
                    assertHttpError(error, `${codePrefix}_REASON_TOO_LONG`, 400);
                    return true;
                }
            );
        }
    });
});
