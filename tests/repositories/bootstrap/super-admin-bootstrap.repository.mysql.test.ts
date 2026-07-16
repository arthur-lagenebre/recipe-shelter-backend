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
    passwordHash: 'password-hash'
};

describe('SuperAdminBootstrapRepositoryMysql', () => {
    it('locks the role and atomically creates the active staff account with its sole role', async () => {
        const fake = createPool();
        const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

        assert.deepEqual(await repository.createFirst(input), { status: 'created', userId: 42 });

        assert.match(fake.statements[0]?.sql ?? '', /FROM Roles[\s\S]+FOR UPDATE/);
        assert.deepEqual(fake.statements[0]?.params, ['SuperAdmin']);
        assert.match(fake.statements[1]?.sql ?? '', /FROM StaffRoles/);
        assert.match(fake.statements[2]?.sql ?? '', /FROM Users[\s\S]+FOR UPDATE/);
        assert.deepEqual(fake.statements[3]?.params, [
            'first@example.com',
            'first-admin',
            'password-hash'
        ]);
        assert.match(fake.statements[4]?.sql ?? '', /INSERT INTO StaffProfiles/);
        assert.deepEqual(fake.statements[5]?.params, [42, 5]);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('stops before account creation when any SuperAdmin already exists', async () => {
        for (const status of ['active', 'disabled']) {
            const fake = createPool({
                superAdminRows: [{
                    SuperAdminCount: 1,
                    ActiveSuperAdminCount: status === 'active' ? 1 : 0
                }]
            });
            const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

            assert.deepEqual(
                await repository.createFirst(input),
                { status: 'super_admin_exists', active: status === 'active' }
            );
            assert.equal(fake.statements.some(({ sql }) => /INSERT INTO Users/.test(sql)), false);
            assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
        }
    });

    it('requires the central seed role and rejects identities already in use', async () => {
        const missingRole = createPool({ roleRows: [] });
        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(missingRole.pool).createFirst(input),
            { status: 'role_missing' }
        );

        const emailTaken = createPool({
            identityRows: [{ Mail: 'FIRST@example.com', Username: 'someone' }]
        });
        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(emailTaken.pool).createFirst(input),
            { status: 'email_taken' }
        );

        const usernameTaken = createPool({
            identityRows: [{ Mail: 'someone@example.com', Username: 'FIRST-ADMIN' }]
        });
        assert.deepEqual(
            await new SuperAdminBootstrapRepositoryMysql(usernameTaken.pool).createFirst(input),
            { status: 'username_taken' }
        );
    });

    it('rolls back and maps a concurrent unique email insertion', async () => {
        const duplicateError = Object.assign(new Error("Duplicate entry for key 'users_mail_UK'"), {
            code: 'ER_DUP_ENTRY'
        });
        const fake = createPool({ userInsertError: duplicateError });
        const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

        assert.deepEqual(await repository.createFirst(input), { status: 'email_taken' });
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });

    it('rolls back, releases and preserves unexpected database errors', async () => {
        const databaseError = new Error('database unavailable');
        const fake = createPool({ userInsertError: databaseError });
        const repository = new SuperAdminBootstrapRepositoryMysql(fake.pool);

        await assert.rejects(() => repository.createFirst(input), databaseError);
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });
});
