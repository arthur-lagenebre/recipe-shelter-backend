import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UserRepositoryMysql } from '../../../src/repositories/users/user.repository.mysql.js';

import type { User } from '../../../src/repositories/users/user.types.js';
import type { Pool } from 'mysql2/promise';

const now = new Date('2026-07-14T10:00:00.000Z');
const baseUser: User = {
    id: 42,
    mail: 'user@example.com',
    username: 'testuser',
    roleId: 2,
    accountType: 'community',
    status: 'inactive',
    emailValidatedAt: null,
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: now,
    updatedAt: now
};

type Statement = { sql: string; params: unknown };

function createTransactionalPool(profileInsertError?: Error) {
    const statements: Statement[] = [];
    let commits = 0;
    let rollbacks = 0;
    let releases = 0;
    const connection = {
        async beginTransaction() { return undefined; },
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });
            if (profileInsertError && /Profiles/.test(sql))
                throw profileInsertError;
            return [/INSERT INTO Users/.test(sql) ? { insertId: 42, affectedRows: 1 } : { affectedRows: 1 }];
        },
        async commit() { commits += 1; },
        async rollback() { rollbacks += 1; },
        release() { releases += 1; }
    };
    const pool = {
        async getConnection() { return connection; }
    } as unknown as Pool;

    return { pool, statements, counts: () => ({ commits, rollbacks, releases }) };
}

describe('UserRepositoryMysql', () => {
    it('rejects an unsupported account type before opening a transaction', async () => {
        let connectionCalls = 0;
        const repository = new UserRepositoryMysql({
            async getConnection() {
                connectionCalls += 1;
                throw new Error('Database should not be called');
            }
        } as unknown as Pool);

        await assert.rejects(
            () => repository.create({
                mail: 'user@example.com',
                username: 'testuser',
                passwordHash: 'hash',
                roleId: 2,
                accountType: 'partner' as never
            }),
            { name: 'TypeError', message: 'Invalid account type: partner' }
        );
        assert.equal(connectionCalls, 0);
    });

    it('creates only a community profile and keeps the rollback status mirror', async () => {
        const fake = createTransactionalPool();
        const repository = new UserRepositoryMysql(fake.pool);
        repository.findById = async () => baseUser;

        await repository.create({
            mail: 'user@example.com',
            username: 'testuser',
            passwordHash: 'hash',
            roleId: 2,
            accountType: 'community'
        });

        assert.match(fake.statements[0]?.sql ?? '', /INSERT INTO Users/);
        assert.deepEqual(fake.statements[0]?.params, ['user@example.com', 'testuser', 'hash', 2, 'community', 'inactive']);
        assert.match(fake.statements[1]?.sql ?? '', /INSERT INTO CommunityProfiles/);
        assert.equal(fake.statements.some(({ sql }) => /INSERT INTO StaffProfiles/.test(sql)), false);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('creates staff statuses only in StaffProfiles and maps locked to the legacy mirror', async () => {
        const fake = createTransactionalPool();
        const repository = new UserRepositoryMysql(fake.pool);
        repository.findById = async () => ({ ...baseUser, accountType: 'staff', status: 'locked' });

        await repository.create({
            mail: 'staff@example.com',
            username: 'staff',
            passwordHash: 'hash',
            roleId: 1,
            accountType: 'staff',
            status: 'locked'
        });

        assert.deepEqual(fake.statements[0]?.params, ['staff@example.com', 'staff', 'hash', 1, 'staff', 'banned']);
        assert.match(fake.statements[1]?.sql ?? '', /INSERT INTO StaffProfiles/);
        assert.deepEqual(fake.statements[1]?.params, [42, 'locked', 'locked']);
        assert.equal(fake.statements.some(({ sql }) => /INSERT INTO CommunityProfiles/.test(sql)), false);
    });

    it('rolls back identity creation when profile creation fails', async () => {
        const fake = createTransactionalPool(new Error('profile insert failed'));
        const repository = new UserRepositoryMysql(fake.pool);

        await assert.rejects(() => repository.create({
            mail: 'staff@example.com',
            username: 'staff',
            passwordHash: 'hash',
            roleId: 1,
            accountType: 'staff'
        }), /profile insert failed/);

        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });
});
