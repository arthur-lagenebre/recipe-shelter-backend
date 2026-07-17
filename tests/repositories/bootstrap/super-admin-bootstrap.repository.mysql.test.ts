import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SuperAdminBootstrapRepositoryMysql } from '../../../src/repositories/bootstrap/super-admin-bootstrap.repository.mysql.js';

import type { Pool } from 'mysql2/promise';

type FakeOptions = {
    roleRows?: unknown[];
    superAdminRows?: unknown[];
    identityRows?: unknown[];
    userInsertError?: unknown;
};

type Statement = {
    sql: string;
    params: unknown;
};

function createPool(options: FakeOptions = {}) {
    const statements: Statement[] = [];
    let commits = 0;
    let rollbacks = 0;
    let releases = 0;

    const connection = {
        async beginTransaction() { return undefined; },
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });

            if (/FROM Roles/.test(sql))
                return [options.roleRows ?? [{ Id: 5 }]];
            if (/FROM StaffRoles/.test(sql))
                return [options.superAdminRows ?? []];
            if (/FROM Users/.test(sql))
                return [options.identityRows ?? []];
            if (/INSERT INTO Users/.test(sql)) {
                if (options.userInsertError)
                    throw options.userInsertError;
                return [{ insertId: 42, affectedRows: 1 }];
            }

            return [{ affectedRows: 1 }];
        },
        async commit() { commits += 1; },
        async rollback() { rollbacks += 1; },
        release() { releases += 1; }
    };
    const pool = {
        async getConnection() { return connection; }
    } as unknown as Pool;

    return {
        pool,
        statements,
        counts: () => ({ commits, rollbacks, releases })
    };
}

const input = {
    mail: 'first@example.com',
    username: 'first-admin',
    invitationTokenHash: 'a'.repeat(64),
    invitationTtlMinutes: 30
};

async function completeCreation(): Promise<void> { }

describe('SuperAdminBootstrapRepositoryMysql', () => {
    it('locks the role and atomically creates the invited account, role and expiring MFA invitation', async () => {
        const fake = createPool();
        const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);
        let preparedUserId: number | null = null;

        assert.deepEqual(await repository.createFirst(input, async ({ userId }) => {
            preparedUserId = userId;
        }), { status: 'created', userId: 42 });

        assert.match(fake.statements[0]?.sql ?? '', /FROM Roles[\s\S]+FOR UPDATE/);
        assert.deepEqual(fake.statements[0]?.params, ['SuperAdmin']);
        assert.match(fake.statements[1]?.sql ?? '', /FROM StaffRoles/);
        assert.match(fake.statements[2]?.sql ?? '', /FROM Users[\s\S]+FOR UPDATE/);
        assert.match(fake.statements[3]?.sql ?? '', /NULL, 'staff', 'inactive', NULL/);
        assert.deepEqual(fake.statements[3]?.params, ['first@example.com', 'first-admin']);
        assert.match(fake.statements[4]?.sql ?? '', /INSERT INTO StaffProfiles[\s\S]+'invited'/);
        assert.deepEqual(fake.statements[5]?.params, [42, 5]);
        assert.match(fake.statements[6]?.sql ?? '', /INSERT INTO StaffInvitations/);
        assert.match(fake.statements[6]?.sql ?? '', /RequiresMfa[\s\S]+TRUE/);
        assert.deepEqual(fake.statements[6]?.params, [42, 'a'.repeat(64), 30]);
        assert.equal(preparedUserId, 42);
        assert.equal(JSON.stringify(fake.statements).includes('raw-token'), false);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('stops before account creation when any SuperAdmin already exists', async () => {
        for (const status of ['active', 'invited']) {
            const fake = createPool({
                superAdminRows: [{
                    SuperAdminCount: 1,
                    ActiveSuperAdminCount: status === 'active' ? 1 : 0
                }]
            });
            const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

            assert.deepEqual(
                await repository.createFirst(input, completeCreation),
                { status: 'super_admin_exists', active: status === 'active' }
            );
            assert.equal(fake.statements.some(({ sql }) => /INSERT INTO Users/.test(sql)), false);
            assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
        }
    });

    it('continues when the locked role aggregate confirms that no SuperAdmin exists', async () => {
        const fake = createPool({
            superAdminRows: [{ SuperAdminCount: 0, ActiveSuperAdminCount: 0 }]
        });

        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(fake.pool).createFirst(input, completeCreation),
            { status: 'created', userId: 42 }
        );
        assert.equal(fake.statements.some(({ sql }) => /INSERT INTO Users/.test(sql)), true);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('requires the central seed role and rejects identities already in use', async () => {
        const missingRole = createPool({ roleRows: [] });
        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(missingRole.pool).createFirst(input, completeCreation),
            { status: 'role_missing' }
        );

        const emailTaken = createPool({
            identityRows: [{ Mail: 'FIRST@example.com', Username: 'someone' }]
        });
        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(emailTaken.pool).createFirst(input, completeCreation),
            { status: 'email_taken' }
        );

        const usernameTaken = createPool({
            identityRows: [{ Mail: 'someone@example.com', Username: 'FIRST-ADMIN' }]
        });
        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(usernameTaken.pool).createFirst(input, completeCreation),
            { status: 'username_taken' }
        );
    });

    it('rolls back uncommitted creation when invitation delivery fails without deleting a staff identity', async () => {
        const deliveryError = new Error('mail delivery failed');
        const fake = createPool();
        const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

        await assert.rejects(
            () => repository.createFirst(input, async () => { throw deliveryError; }),
            deliveryError
        );
        assert.equal(fake.statements.some(({ sql }) => /DELETE\s+FROM/i.test(sql)), false);
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });

    it('rolls back and maps a concurrent unique email insertion', async () => {
        const duplicateError = Object.assign(new Error("Duplicate entry for key 'users_mail_UK'"), {
            code: 'ER_DUP_ENTRY'
        });
        const fake = createPool({ userInsertError: duplicateError });
        const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

        assert.deepEqual(await repository.createFirst(input, completeCreation), { status: 'email_taken' });
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });

    it('rolls back and maps a concurrent unique username insertion', async () => {
        const duplicateError = Object.assign(new Error("Duplicate entry for key 'users_username_UK'"), {
            code: 'ER_DUP_ENTRY'
        });
        const fake = createPool({ userInsertError: duplicateError });

        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(fake.pool).createFirst(input, completeCreation),
            { status: 'username_taken' }
        );
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });

    it('preserves unrecognized duplicate errors with or without a database message', async () => {
        const unknownConstraint = Object.assign(new Error("Duplicate entry for key 'other_UK'"), {
            code: 'ER_DUP_ENTRY'
        });
        const noMessage = { code: 'ER_DUP_ENTRY' };

        for (const error of [unknownConstraint, noMessage]) {
            const fake = createPool({ userInsertError: error });
            await assert.rejects(
                () => new SuperAdminBootstrapRepositoryMysql(fake.pool).createFirst(input, completeCreation),
                (caught) => caught === error
            );
            assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
        }
    });

    it('preserves primitive database failures', async () => {
        const primitiveError = 'database unavailable';
        const fake = createPool({ userInsertError: primitiveError });

        await assert.rejects(
            () => new SuperAdminBootstrapRepositoryMysql(fake.pool).createFirst(input, completeCreation),
            (caught) => caught === primitiveError
        );
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });

    it('rolls back, releases and preserves unexpected database errors', async () => {
        const createError = new Error('database unavailable');
        const create = createPool({ userInsertError: createError });
        await assert.rejects(
            () => new SuperAdminBootstrapRepositoryMysql(create.pool).createFirst(input, completeCreation),
            createError
        );
        assert.deepEqual(create.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });
});
