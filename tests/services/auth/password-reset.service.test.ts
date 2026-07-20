import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import bcrypt from 'bcrypt';

import { PasswordResetService } from '../../../src/services/auth/password-reset.service.js';
import { env } from '../../../src/utils/env.js';
import { hashResetToken } from '../../../src/utils/security/password-reset-token.js';

import type { PasswordResetRepository } from '../../../src/repositories/auth/password-reset.repository.interface.js';
import type { SessionRepository } from '../../../src/repositories/auth/session.repository.interface.js';
import type { PasswordResetMailInput, Mailer } from '../../../src/services/mail/mail.types.js';

type UserLite = {
    id: number;
    mail: string;
    username: string;
};

const user = { id: 2, mail: 'user@example.com', username: 'testuser' };

class FakeUsers {
    userByEmail: UserLite | null = user;
    userById: UserLite | null = user;
    updatedPassword: { userId: number; passwordHash: string } | null = null;

    async findByEmail(): Promise<UserLite | null> {
        return this.userByEmail;
    }

    async findById(): Promise<UserLite | null> {
        return this.userById;
    }

    async updatePassword(userId: number, passwordHash: string): Promise<void> {
        this.updatedPassword = { userId, passwordHash };
    }
}

class FakeResets implements PasswordResetRepository {
    invalidatedUserId: number | null = null;
    createdInput: { userId: number; tokenHash: string; expiresInMinutes: number } | null = null;
    validReset: Awaited<ReturnType<PasswordResetRepository['findValidByTokenHash']>> = null;
    markedUsedId: number | null = null;
    tokenHashInput: string | null = null;

    async create(input: { userId: number; tokenHash: string; expiresInMinutes: number }): Promise<void> {
        this.createdInput = input;
    }

    async invalidateAllForUser(userId: number): Promise<void> {
        this.invalidatedUserId = userId;
    }

    async findValidByTokenHash(tokenHash: string) {
        this.tokenHashInput = tokenHash;

        return this.validReset;
    }

    async markUsed(id: number): Promise<void> {
        this.markedUsedId = id;
    }
}

class FakeMailer implements Partial<Mailer> {
    resetEmail: PasswordResetMailInput | null = null;
    changedEmail: { to: string; username: string } | null = null;

    async sendPasswordResetEmail(input: PasswordResetMailInput): Promise<void> {
        this.resetEmail = input;
    }

    async sendPasswordChangedEmail(input: { to: string; username: string }): Promise<void> {
        this.changedEmail = input;
    }
}

class FakeSessions {
    revocations: Array<{
        userId: number;
        revocationType: 'password_changed';
        exceptSessionId?: string;
    }> = [];

    async revokeAllCommunitySessions(userId: number, revocationType: 'password_changed', exceptSessionId?: string): Promise<number> {
        this.revocations.push({ userId, revocationType, exceptSessionId });

        return 2;
    }
}

describe('PasswordResetService', () => {
    let users: FakeUsers;
    let resets: FakeResets;
    let sessions: FakeSessions;
    let mailer: FakeMailer;
    let service: PasswordResetService;

    beforeEach(() => {
        env.auth.bcryptCost = 4;
        users = new FakeUsers();
        resets = new FakeResets();
        sessions = new FakeSessions();
        mailer = new FakeMailer();
        service = new PasswordResetService(users, resets, sessions as unknown as SessionRepository, mailer as unknown as Mailer, 'https://front.example');
    });

    it('ignores blank and unknown reset requests', async () => {
        await service.requestReset('   ');
        assert.equal(resets.invalidatedUserId, null);

        users.userByEmail = null;
        await service.requestReset('user@example.com');
        assert.equal(resets.invalidatedUserId, null);
        assert.equal(mailer.resetEmail, null);
    });

    it('invalidates previous reset tokens, stores a hash and sends a reset link', async () => {
        await service.requestReset(' USER@Example.COM ');

        assert.equal(resets.invalidatedUserId, 2);
        assert.equal(resets.createdInput?.userId, 2);
        assert.equal(resets.createdInput?.expiresInMinutes, 30);
        assert.match(resets.createdInput?.tokenHash ?? '', /^[a-f0-9]{64}$/);
        assert.equal(mailer.resetEmail?.to, 'user@example.com');

        const resetUrl = new URL(mailer.resetEmail?.resetUrl ?? '');
        const token = resetUrl.searchParams.get('token') ?? '';
        assert.equal(resetUrl.origin, 'https://front.example');
        assert.equal(hashResetToken(token), resets.createdInput?.tokenHash);
    });

    it('resets a password and marks the token as used', async () => {
        resets.validReset = {
            Id: 9,
            UserId: 2
        };

        await service.resetPassword(' token ', 'NewPass42');

        assert.equal(resets.tokenHashInput, hashResetToken('token'));
        assert.equal(users.updatedPassword?.userId, 2);
        assert.equal(await bcrypt.compare('NewPass42', users.updatedPassword?.passwordHash ?? ''), true);
        assert.deepEqual(sessions.revocations, [{ userId: 2, revocationType: 'password_changed', exceptSessionId: undefined }]);
        assert.equal(resets.markedUsedId, 9);
        assert.deepEqual(mailer.changedEmail, { to: 'user@example.com', username: 'testuser' });
    });

    it('rejects invalid reset inputs', async () => {
        await assert.rejects(() => service.resetPassword(' ', 'NewPass42'), /Reset token is required/);
        await assert.rejects(() => service.resetPassword('token', 'short'), /at least 8 characters/);
        await assert.rejects(() => service.resetPassword('token', 'NewPass42'), /Invalid or expired reset token/);
    });
});
