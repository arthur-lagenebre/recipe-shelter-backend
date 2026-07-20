import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAdminTagActionReasonBody, parseAdminTagIdParam, parseAdminTagListFilters, parseCreateAdminTagBody, parseMergeAdminTagBody, parseUpdateAdminTagBody } from '../../../src/api/admin/admin.tags.dto.js';
import { HttpError } from '../../../src/utils/errors.js';

describe('admin tags DTO validation', () => {
  it('parses identifiers and list filters', () => {
    assert.equal(parseAdminTagIdParam('42'), 42);
    assert.deepEqual(parseAdminTagListFilters({
      status: 'deprecated',
      groupId: '3',
      q: '  dessert  ',
      page: '2',
      limit: '25'
    }), {
      status: 'deprecated',
      groupId: 3,
      q: 'dessert'
    });
    assert.deepEqual(parseAdminTagListFilters({}), {});
  });

  it('rejects malformed identifiers and filters with stable errors', () => {
    assert.throws(() => parseAdminTagIdParam('1.5'), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_ID'));
    assert.throws(() => parseAdminTagIdParam('9007199254740992'), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_ID'));
    assert.throws(() => parseAdminTagListFilters([]), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_QUERY'));
    assert.throws(() => parseAdminTagListFilters({ status: 'deleted' }), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_STATUS'));
    assert.throws(() => parseAdminTagListFilters({ groupId: '0' }), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_GROUP_ID'));
    assert.throws(() => parseAdminTagListFilters({ q: '   ' }), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_SEARCH'));
  });

  it('parses create and partial update payloads', () => {
    assert.deepEqual(parseCreateAdminTagBody({
      groupId: 2,
      name: '  Riche en protéines  ',
      slug: 'riche-en-proteines',
      description: '  Plus de protéines.  '
    }), {
      groupId: 2,
      name: 'Riche en protéines',
      slug: 'riche-en-proteines',
      description: 'Plus de protéines.'
    });
    assert.deepEqual(parseCreateAdminTagBody({ groupId: 1, name: 'Végétarien' }), {
      groupId: 1,
      name: 'Végétarien'
    });
    assert.deepEqual(parseUpdateAdminTagBody({ description: null }), { description: null });
    assert.deepEqual(parseUpdateAdminTagBody({ groupId: 4, name: 'Rapide' }), {
      groupId: 4,
      name: 'Rapide'
    });
  });

  it('rejects empty, oversized and structurally invalid tag payloads', () => {
    assert.throws(() => parseCreateAdminTagBody([]), (error) => assertHttpError(error, 'ADMIN_TAGS_CREATE_BAD_BODY'));
    assert.throws(() => parseCreateAdminTagBody({ groupId: 0, name: 'Valid' }), (error) => assertHttpError(error, 'ADMIN_TAGS_BAD_GROUP_ID'));
    assert.throws(() => parseCreateAdminTagBody({ groupId: 1, name: ' ' }), (error) => assertHttpError(error, 'ADMIN_TAGS_NAME_REQUIRED'));
    assert.throws(() => parseCreateAdminTagBody({ groupId: 1, name: 'Valid', slug: 'Not Valid' }), (error) => assertHttpError(error, 'ADMIN_TAGS_SLUG_INVALID'));
    assert.throws(() => parseCreateAdminTagBody({ groupId: 1, name: 'Valid', description: ' ' }), (error) => assertHttpError(error, 'ADMIN_TAGS_DESCRIPTION_INVALID'));
    assert.throws(() => parseUpdateAdminTagBody({}), (error) => assertHttpError(error, 'ADMIN_TAGS_UPDATE_EMPTY'));
    assert.throws(() => parseUpdateAdminTagBody({ description: 'x'.repeat(1001) }), (error) => assertHttpError(error, 'ADMIN_TAGS_DESCRIPTION_TOO_LONG'));
  });

  it('requires meaningful lifecycle and merge reasons', () => {
    assert.equal(
      parseAdminTagActionReasonBody({ reason: '  Tag devenu obsolète.  ' }, 'deprecate'),
      'Tag devenu obsolète.'
    );
    assert.deepEqual(parseMergeAdminTagBody({
      targetTagId: 8,
      reason: '  Doublon du tag canonique.  '
    }), {
      targetTagId: 8,
      reason: 'Doublon du tag canonique.'
    });

    assert.throws(
      () => parseAdminTagActionReasonBody({ reason: 'court' }, 'restore'),
      (error) => assertHttpError(error, 'ADMIN_TAGS_RESTORE_REASON_TOO_SHORT')
    );
    assert.throws(
      () => parseMergeAdminTagBody({ targetTagId: 0, reason: 'Motif suffisamment long.' }),
      (error) => assertHttpError(error, 'ADMIN_TAGS_MERGE_BAD_TARGET_ID')
    );
    assert.throws(
      () => parseMergeAdminTagBody([]),
      (error) => assertHttpError(error, 'ADMIN_TAGS_MERGE_BAD_BODY')
    );
    assert.throws(
      () => parseMergeAdminTagBody({ targetTagId: 2 }),
      (error) => assertHttpError(error, 'ADMIN_TAGS_MERGE_REASON_REQUIRED')
    );
  });
});

function assertHttpError(error: unknown, code: string): boolean {
  assert.ok(error instanceof HttpError);
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, code);
  return true;
}
