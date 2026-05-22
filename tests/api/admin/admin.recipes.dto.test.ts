import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRejectRecipeBody } from '../../../src/api/admin/admin.recipes.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('admin.recipes.dto', () => {
    it('parses and trims a rejection reason', () => {
        assert.equal(parseRejectRecipeBody({ rejectionReason: '  Missing preparation details.  ' }), 'Missing preparation details.');
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
            () => parseRejectRecipeBody({ rejectionReason: '   ' }),
            (error) => {
                assertHttpError(error, 'ADMIN_RECIPES_REJECT_MISSING_REASON', 400);
                return true;
            }
        );
    });
});
