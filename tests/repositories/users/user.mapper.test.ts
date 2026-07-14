import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapUser } from '../../../src/repositories/users/user.mappers.js';

import type { UserRow } from '../../../src/repositories/users/user.types.js';

const baseRow = {
    Id: 2,
    Mail: 'user@example.com',
    Username: 'testuser',
    RoleId: 2,
    Status: 'active',
    EmailValidatedAt: new Date('2026-07-14T10:00:00.000Z'),
    BannedByUserId: null,
    BannedReason: null,
    BannedAt: null,
    CreatedAt: new Date('2026-07-14T10:00:00.000Z'),
    UpdatedAt: new Date('2026-07-14T10:00:00.000Z')
} as const;

describe('user mapper', () => {
    it('maps every supported account type', () => {
        for (const accountType of ['community', 'staff'] as const) {
            const user = mapUser({ ...baseRow, AccountType: accountType } as unknown as UserRow);

            assert.equal(user.accountType, accountType);
        }
    });

    it('rejects an unsupported account type returned by persistence', () => {
        assert.throws(
            () => mapUser({ ...baseRow, AccountType: 'partner' } as unknown as UserRow),
            { name: 'TypeError', message: 'Invalid account type: partner' }
        );
    });
});
