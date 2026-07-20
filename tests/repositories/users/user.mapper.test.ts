import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapCommunityProfile, mapStaffProfile, mapUser, mapUserWithPassword } from '../../../src/repositories/users/user.mapper.js';

import type { CommunityProfileRow, StaffProfileRow, UserRow, UserWithPasswordRow } from '../../../src/repositories/users/user.types.js';

const now = new Date('2026-07-14T10:00:00.000Z');
const baseRow = {
    Id: 2,
    Mail: 'user@example.com',
    Username: 'testuser',
    EmailValidatedAt: now,
    BannedByUserId: null,
    BannedReason: null,
    BannedAt: null,
    CreatedAt: now,
    UpdatedAt: now
} as const;

describe('user mapper', () => {
    it('maps community users only from their community profile', () => {
        const user = mapUser({
            ...baseRow,
            AccountType: 'community',
            CommunityProfileUserId: 2,
            CommunityStatus: 'banned',
            StaffProfileUserId: null,
            StaffStatus: null,
            BannedByUserId: 1,
            BannedReason: 'Community moderation',
            BannedAt: now
        } as unknown as UserRow);

        assert.equal(user.accountType, 'community');
        assert.equal(user.status, 'banned');
        assert.equal(user.bannedByUserId, 1);
    });

    it('maps every staff status without community moderation data', () => {
        for (const status of ['invited', 'active', 'locked', 'disabled'] as const) {
            const user = mapUser({
                ...baseRow,
                AccountType: 'staff',
                CommunityProfileUserId: null,
                CommunityStatus: null,
                StaffProfileUserId: 2,
                StaffStatus: status,
                BannedByUserId: 1,
                BannedReason: 'Must not leak',
                BannedAt: now
            } as unknown as UserRow);

            assert.equal(user.accountType, 'staff');
            assert.equal(user.status, status);
            assert.equal(user.bannedByUserId, null);
            assert.equal(user.bannedReason, null);
            assert.equal(user.bannedAt, null);
        }
    });

    it('maps specialized profile records', () => {
        const community = mapCommunityProfile({
            UserId: 2,
            Status: 'active',
            BannedByUserId: null,
            BannedReason: null,
            BannedAt: null,
            CreatedAt: now,
            UpdatedAt: now
        } as CommunityProfileRow);
        const staff = mapStaffProfile({
            UserId: 1,
            Status: 'locked',
            MfaEnrolledAt: now,
            DisabledByStaffUserId: null,
            DisabledReason: null,
            DisabledAt: null,
            CreatedAt: now,
            UpdatedAt: now
        } as StaffProfileRow);

        assert.equal(community.status, 'active');
        assert.equal(staff.status, 'locked');
    });

    it('binds staff password authentication to the current session version', () => {
        const user = mapUserWithPassword({
            ...baseRow,
            AccountType: 'staff',
            CommunityProfileUserId: null,
            CommunityStatus: null,
            StaffProfileUserId: 2,
            StaffStatus: 'active',
            StaffSessionVersion: 4,
            Password: 'password-hash'
        } as unknown as UserWithPasswordRow);

        assert.equal(user.passwordHash, 'password-hash');
        assert.equal(user.staffSessionVersion, 4);
    });

    it('rejects unsupported statuses and cross-profile assignments', () => {
        assert.throws(
            () => mapUser({ ...baseRow, AccountType: 'partner' } as unknown as UserRow),
            { name: 'TypeError', message: 'Invalid account type: partner' }
        );
        assert.throws(
            () => mapUser({
                ...baseRow,
                AccountType: 'staff',
                CommunityProfileUserId: 2,
                CommunityStatus: 'active',
                StaffProfileUserId: 2,
                StaffStatus: 'active'
            } as unknown as UserRow),
            { name: 'TypeError', message: 'Invalid profile assignment for staff user: 2' }
        );
        assert.throws(
            () => mapStaffProfile({ UserId: 1, Status: 'banned', CreatedAt: now, UpdatedAt: now } as StaffProfileRow),
            { name: 'TypeError', message: 'Invalid staff status: banned' }
        );
    });
});
