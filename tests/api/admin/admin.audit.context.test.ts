import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getAdminAuditRequestContext } from '../../../src/api/admin/admin.audit.context.js';

import type { Request } from 'express';

describe('getAdminAuditRequestContext', () => {
  it('keeps bounded investigation metadata from the administrative request', () => {
    const context = getAdminAuditRequestContext({
      ip: ' 2001:db8::8 ',
      headers: { 'user-agent': `  ${'a'.repeat(600)}  ` }
    } as Request);

    assert.deepEqual(context, {
      ipAddress: '2001:db8::8',
      userAgent: 'a'.repeat(512)
    });
  });

  it('drops unusable request metadata instead of breaking the mandatory audit', () => {
    const context = getAdminAuditRequestContext({
      ip: 'x'.repeat(46),
      headers: { 'user-agent': '   ' }
    } as Request);

    assert.deepEqual(context, {
      ipAddress: null,
      userAgent: null
    });
  });
});
