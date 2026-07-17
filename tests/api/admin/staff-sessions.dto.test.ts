import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseManagedStaffSessionRevocationBody, parseStaffSessionIdParam, parseStaffUserIdParam } from '../../../src/api/admin/staff-sessions.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

describe('staff sessions DTO', () => {
  it('parses positive staff IDs and canonicalizes UUID session IDs', () => {
    assert.equal(parseStaffUserIdParam('42'), 42);
    assert.equal(
      parseStaffSessionIdParam(' 00000000-0000-4000-8000-0000000000AB '),
      '00000000-0000-4000-8000-0000000000ab'
    );
  });

  it('rejects malformed, unsafe and non-positive identifiers', () => {
    for (const value of ['', '0', '-1', '1.5', '9007199254740992']) {
      assert.throws(
        () => parseStaffUserIdParam(value),
        (error) => assertHttpError(error, 'STAFF_SESSION_BAD_USER_ID')
      );
    }

    for (const value of ['', 'not-a-uuid', '00000000-0000-0000-0000-00000000000']) {
      assert.throws(
        () => parseStaffSessionIdParam(value),
        (error) => assertHttpError(error, 'STAFF_SESSION_BAD_ID')
      );
    }
  });

  it('requires a meaningful reason for an administrative revocation', () => {
    assert.equal(
      parseManagedStaffSessionRevocationBody({ reason: '  Compromised browser session.  ' }),
      'Compromised browser session.'
    );

    for (const body of [null, {}, { reason: 'short' }, { reason: 'x'.repeat(1001) }]) {
      assert.throws(
        () => parseManagedStaffSessionRevocationBody(body),
        (error) => {
          assert.ok(error instanceof HttpError);
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    }
  });
});

function assertHttpError(error: unknown, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, code);

  return true;
}
