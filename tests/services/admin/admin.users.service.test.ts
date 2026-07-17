import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AdminUserService } from '../../../src/services/admin/admin.users.service.js';
import { HttpError } from '../../../src/utils/errors.js';
import { TestAdminAuditRecorder, testAdminAuditContext } from '../../helpers/admin-audit.js';

import type { AdminUserRepository } from '../../../src/repositories/admin/admin.users.repository.interface.js';
import type { AdminUserDetails, BannedUser, UserModerationLog } from '../../../src/repositories/admin/admin.users.types.js';
import type { CommunityProfile, CreateUserInput, StaffProfile, User, UserWithPassword } from '../../../src/repositories/users/user.types.js';
import type { UserRepository } from '../../../src/repositories/users/user.repository.interface.js';

const baseUser: User = {
    id: 2,
    mail: 'user@example.com',
    username: 'testuser',
    accountType: 'community',
    status: 'active',
    emailValidatedAt: new Date('2026-05-09T10:00:00.000Z'),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-09T10:00:00.000Z')
};

const baseBannedUser: BannedUser = {
    id: 3,
    username: 'banneduser',
    mail: 'banned@example.com',
    status: 'banned',
    bannedAt: new Date('2026-05-10T10:00:00.000Z'),
    bannedReason: 'Repeated abuse of the platform rules.',
    bannedByUsername: 'admin'
};

const baseAdminUser: AdminUserDetails = {
    id: 2,
    username: 'testuser',
    email: 'user@example.com',
    status: 'banned',
    banReason: 'Repeated abuse of the platform rules.',
    bannedAt: new Date('2026-05-10T10:00:00.000Z'),
    bannedByUserId: 1,
    createdAt: new Date('2026-05-09T10:00:00.000Z'),
    updatedAt: new Date('2026-05-10T10:00:00.000Z')
};

const baseModerationLog: UserModerationLog = {
    id: 10,
    userId: 2,
    adminId: 1,
    action: 'ban',
    reason: 'Repeated abuse of the platform rules.',
    adminUsername: 'admin',
    createdAt: new Date('2026-05-10T10:00:00.000Z')
};

class FakeUserRepository implements UserRepository {
    user: User | null = baseUser;
    findByIdInput: number | null = null;

    async create(input: CreateUserInput): Promise<User> {
        void input;
        throw new Error('Not implemented');
    }

    async findById(id: number): Promise<User | null> {
        this.findByIdInput = id;

        return this.user;
    }

    async findByEmail(mail: string): Promise<User | null> {
        void mail;

        return null;
    }

    async findByUsername(username: string): Promise<User | null> {
        void username;

        return null;
    }

    async findCommunityProfileByUserId(userId: number): Promise<CommunityProfile | null> {
        void userId;
        return null;
    }

    async findStaffProfileByUserId(userId: number): Promise<StaffProfile | null> {
        void userId;
        return null;
    }

    async findAuthByEmail(mail: string): Promise<UserWithPassword | null> {
        void mail;

        return null;
    }

    async findWithPasswordById(id: number): Promise<UserWithPassword | null> {
        void id;

        return null;
    }

    async markEmailValidated(userId: number): Promise<boolean> {
        void userId;

        return true;
    }

    async updateEmail(userId: number, mail: string): Promise<void> {
        void userId;
        void mail;
    }

    async updatePassword(userId: number, passwordHash: string): Promise<void> {
        void userId;
        void passwordHash;
    }

    async updateUsername(userId: number, username: string): Promise<void> {
        void userId;
        void username;
    }

    async isEmailTaken(mail: string): Promise<boolean> {
        void mail;

        return false;
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        void username;

        return false;
    }
}

class FakeAdminUserRepository implements AdminUserRepository {
    bannedUsers: BannedUser[] = [baseBannedUser];
    adminUser: AdminUserDetails | null = baseAdminUser;
    moderationLogs: UserModerationLog[] = [baseModerationLog];
    banResult = true;
    unbanResult = true;
    findAdminUserByIdInput: number | null = null;
    findModerationLogsByUserIdInput: number | null = null;
    banInput: { userId: number; adminUserId: number; reason: string } | null = null;
    unbanInput: { userId: number; adminUserId: number; reason: string } | null = null;

    async findBannedForAdmin(): Promise<BannedUser[]> {
        return this.bannedUsers;
    }

    async countBannedForAdmin(): Promise<number> {
        return this.bannedUsers.length;
    }

    async findAdminUserById(userId: number): Promise<AdminUserDetails | null> {
        this.findAdminUserByIdInput = userId;

        return this.adminUser;
    }

    async findModerationLogsByUserId(userId: number): Promise<UserModerationLog[]> {
        this.findModerationLogsByUserIdInput = userId;

        return this.moderationLogs;
    }

    async ban(userId: number, adminUserId: number, reason: string): Promise<boolean> {
        this.banInput = { userId, adminUserId, reason };

        return this.banResult;
    }

    async unban(userId: number, adminUserId: number, reason: string): Promise<boolean> {
        this.unbanInput = { userId, adminUserId, reason };

        return this.unbanResult;
    }
}

function assertHttpError(error: unknown, code: string, status: number): void {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
}

describe('AdminUserService', () => {
    let users: FakeUserRepository;
    let adminUsers: FakeAdminUserRepository;
    let audit: TestAdminAuditRecorder;
    let service: AdminUserService;

    beforeEach(() => {
        users = new FakeUserRepository();
        adminUsers = new FakeAdminUserRepository();
        audit = new TestAdminAuditRecorder();
        service = new AdminUserService(users, adminUsers, audit);
    });

    it('lists banned users', async () => {
        const result = await service.getBannedUsersForAdmin();

        assert.deepEqual(result, [baseBannedUser]);
    });

    it('counts banned users', async () => {
        const result = await service.getCountBannedUsersForAdmin();

        assert.equal(result, 1);
    });

    it('gets an admin-safe user profile with moderation logs', async () => {
        const result = await service.getAdminUserProfile(2);

        assert.equal(adminUsers.findAdminUserByIdInput, 2);
        assert.equal(adminUsers.findModerationLogsByUserIdInput, 2);
        assert.deepEqual(result, {
            ...baseAdminUser,
            moderationLogs: [{
                id: 10,
                action: 'ban',
                reason: 'Repeated abuse of the platform rules.',
                adminId: 1,
                adminUsername: 'admin',
                createdAt: new Date('2026-05-10T10:00:00.000Z')
            }]
        });
        assert.equal('passwordHash' in result, false);
        assert.equal('userId' in result.moderationLogs[0]!, false);
    });

    it('rejects admin user profile when the user does not exist', async () => {
        adminUsers.adminUser = null;

        await assert.rejects(
            () => service.getAdminUserProfile(2),
            (error) => {
                assertHttpError(error, 'USER_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(adminUsers.findModerationLogsByUserIdInput, null);
    });

    it('bans an existing user through the admin repository', async () => {
        const result = await service.ban(2, 1, '  Repeated abuse of the platform rules.  ', testAdminAuditContext);

        assert.equal(result, true);
        assert.equal(users.findByIdInput, 2);
        assert.deepEqual(adminUsers.banInput, {
            userId: 2,
            adminUserId: 1,
            reason: 'Repeated abuse of the platform rules.'
        });
        assert.equal(audit.inputs.length, 1);
        assert.deepEqual(audit.inputs[0], {
            actorUserId: 1,
            eventType: 'users.ban',
            targetType: 'community_user',
            targetId: 2,
            reason: 'Repeated abuse of the platform rules.',
            beforeValues: snapshotBaseUser(),
            afterValues: {
                ...snapshotBaseUser(),
                status: 'banned',
                bannedByUserId: 1,
                bannedReason: 'Repeated abuse of the platform rules.'
            },
            ...testAdminAuditContext
        });
    });

    it('rejects self-ban before updating the user', async () => {
        await assert.rejects(
            () => service.ban(1, 1, 'Repeated abuse of the platform rules.', testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_BAN_SELF_FORBIDDEN', 403);

                return true;
            }
        );
        assert.equal(users.findByIdInput, null);
        assert.equal(adminUsers.banInput, null);
    });

    it('rejects ban when the user does not exist', async () => {
        users.user = null;

        await assert.rejects(
            () => service.ban(2, 1, 'Repeated abuse of the platform rules.', testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'USER_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(adminUsers.banInput, null);
    });

    it('rejects community moderation actions for staff accounts', async () => {
        users.user = { ...baseUser, accountType: 'staff', status: 'locked' };

        await assert.rejects(
            () => service.ban(2, 1, 'Repeated abuse of the platform rules.', testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_STAFF_MODERATION_FORBIDDEN', 403);
                return true;
            }
        );
        await assert.rejects(
            () => service.unban(2, 1, 'Appeal accepted after review.', testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_STAFF_MODERATION_FORBIDDEN', 403);
                return true;
            }
        );
        assert.equal(adminUsers.banInput, null);
        assert.equal(adminUsers.unbanInput, null);
    });

    it('unbans an existing user through the admin repository', async () => {
        users.user = {
            ...baseUser,
            status: 'banned',
            bannedByUserId: 1,
            bannedReason: 'Repeated abuse of the platform rules.'
        };
        const result = await service.unban(2, 1, '  Appeal accepted after review.  ', testAdminAuditContext);

        assert.equal(result, true);
        assert.equal(users.findByIdInput, 2);
        assert.deepEqual(adminUsers.unbanInput, {
            userId: 2,
            adminUserId: 1,
            reason: 'Appeal accepted after review.'
        });
        assert.equal(audit.inputs.length, 1);
        assert.equal(audit.inputs[0]?.eventType, 'users.unban');
    });

    it('rejects unban when the reason is missing', async () => {
        await assert.rejects(
            () => service.unban(2, 1, '   ', testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'ADMIN_USERS_UNBAN_MISSING_REASON', 400);

                return true;
            }
        );
        assert.equal(users.findByIdInput, null);
        assert.equal(adminUsers.unbanInput, null);
    });

    it('rejects unban when the user does not exist', async () => {
        users.user = null;

        await assert.rejects(
            () => service.unban(2, 1, 'Appeal accepted after review.', testAdminAuditContext),
            (error) => {
                assertHttpError(error, 'USER_NOT_FOUND', 404);

                return true;
            }
        );
        assert.equal(adminUsers.unbanInput, null);
    });

    it('does not audit a moderation repository no-op', async () => {
        adminUsers.banResult = false;

        assert.equal(
            await service.ban(2, 1, 'Repeated abuse of the platform rules.', testAdminAuditContext),
            false
        );
        assert.equal(audit.inputs.length, 0);
    });
});

function snapshotBaseUser() {
    return {
        username: baseUser.username,
        status: baseUser.status,
        bannedByUserId: baseUser.bannedByUserId,
        bannedReason: baseUser.bannedReason
    };
}
