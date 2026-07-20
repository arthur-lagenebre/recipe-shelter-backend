import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminStaffRepositoryMysql } from '../../../src/repositories/admin/admin.staff.repository.mysql.js';

import type { Pool, PoolConnection } from 'mysql2/promise';

const staffRow = {
    Id: 42,
    Email: 'staff@test.local',
    DisplayName: 'Coverage Staff',
    Status: 'invited',
    MfaEnrolledAt: null,
    DisabledByStaffUserId: null,
    DisabledByDisplayName: null,
    DisabledReason: null,
    DisabledAt: null,
    ActiveSessionCount: '0',
    CreatedAt: new Date('2026-07-20T10:00:00.000Z'),
    UpdatedAt: new Date('2026-07-20T11:00:00.000Z')
};

describe('AdminStaffRepositoryMysql defensive branches', () => {
    it('returns an empty list without querying roles when no staff exists', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const pool = createConnection(statements, [[[], []]]);
        const repository = new AdminStaffRepositoryMysql(pool as unknown as Pool);

        assert.deepEqual(await repository.findAll(), []);
        assert.equal(statements.length, 1);
    });

    it('maps staff roles and defaults to an empty role list when none is assigned', async () => {
        const repository = new AdminStaffRepositoryMysql({} as Pool);
        const withRoles = createConnection(
            [],
            [
                [[staffRow], []],
                [
                    [
                        { StaffUserId: 42, Id: 5, Code: 'SuperAdmin', Name: 'Super administrator' },
                        { StaffUserId: 42, Id: 4, Code: 'CatalogManager', Name: 'Catalog manager' }
                    ],
                    []
                ]
            ]
        );

        const accounts = await repository.findAll(withRoles);
        assert.deepEqual(
            accounts[0]?.roles.map(({ code }) => code),
            ['SuperAdmin', 'CatalogManager']
        );

        const withoutRoles = createConnection(
            [],
            [
                [[staffRow], []],
                [[], []]
            ]
        );
        const account = await repository.findById(42, withoutRoles);
        assert.deepEqual(account?.roles, []);
    });

    it('returns null for missing staff and roles while locking transactional reads', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const db = createConnection(statements, [
            [[], []],
            [[], []]
        ]);
        const repository = new AdminStaffRepositoryMysql({} as Pool);

        assert.equal(await repository.findById(999, db), null);
        assert.match(statements[0]?.sql ?? '', /FOR UPDATE/);
        assert.equal(await repository.findRoleByCode('UnknownRole', db), null);
    });

    it('uses non-locking pool reads and maps a role found by code', async () => {
        const statements: Array<{ sql: string; params: unknown }> = [];
        const pool = createConnection(statements, [
            [[staffRow], []],
            [[], []],
            [[{ StaffUserId: 0, Id: 4, Code: 'CatalogManager', Name: 'Catalog manager' }], []]
        ]);
        const repository = new AdminStaffRepositoryMysql(pool as unknown as Pool);

        assert.equal((await repository.findById(42))?.id, 42);
        assert.doesNotMatch(statements[0]?.sql ?? '', /FOR UPDATE/);
        assert.deepEqual(await repository.findRoleByCode('CatalogManager'), {
            id: 4,
            code: 'CatalogManager',
            name: 'Catalog manager'
        });
    });

    it('fails closed when the SuperAdmin role or specialized moderation audit link is missing', async () => {
        const repository = new AdminStaffRepositoryMysql({} as Pool);

        assert.equal(await repository.lockAndCheckLastActiveSuperAdmin(42, createConnection([], [[[], []]])), false);

        await assert.rejects(
            () => repository.createModerationLog(100, 42, createConnection([], [[{ affectedRows: 0 }, []]])),
            /Staff moderation log does not match its administrative audit entry/
        );
        await repository.createModerationLog(100, 42, createConnection([], [[{ affectedRows: 1 }, []]]));
    });

    it('distinguishes the target last active SuperAdmin from other cardinalities', async () => {
        const repository = new AdminStaffRepositoryMysql({} as Pool);
        const check = (activeSuperAdmins: Array<{ StaffUserId: number }>): Promise<boolean> =>
            repository.lockAndCheckLastActiveSuperAdmin(
                42,
                createConnection(
                    [],
                    [
                        [[{ Id: 5 }], []],
                        [activeSuperAdmins, []]
                    ]
                )
            );

        assert.equal(await check([]), false);
        assert.equal(await check([{ StaffUserId: 41 }]), false);
        assert.equal(await check([{ StaffUserId: 42 }]), true);
        assert.equal(await check([{ StaffUserId: 42 }, { StaffUserId: 43 }]), false);
    });

    it('defaults a missing active-session count to zero and reports mutation no-ops', async () => {
        const repository = new AdminStaffRepositoryMysql({} as Pool);
        const successfulDisable = createConnection(
            [],
            [
                [[], []],
                [{ affectedRows: 1 }, []]
            ]
        );
        assert.equal(await repository.disable(42, 43, 'Coverage reason is sufficiently detailed.', successfulDisable), 0);

        const concurrentDisable = createConnection(
            [],
            [
                [[{ ActiveSessionCount: 2 }], []],
                [{ affectedRows: 0 }, []]
            ]
        );
        assert.equal(await repository.disable(42, 43, 'Coverage reason is sufficiently detailed.', concurrentDisable), null);

        assert.equal(await repository.enable(42, affectedRowsConnection(0)), false);
        assert.equal(await repository.grantRole(42, 5, affectedRowsConnection(0)), false);
        assert.equal(await repository.revokeRole(42, 5, affectedRowsConnection(0)), false);
    });
});

function affectedRowsConnection(affectedRows: number): PoolConnection {
    return createConnection([], [[{ affectedRows }, []]]);
}

function createConnection(statements: Array<{ sql: string; params: unknown }>, responses: unknown[]): PoolConnection {
    return {
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });
            const response = responses.shift();

            if (!response) throw new Error('Unexpected SQL statement');

            return response;
        }
    } as unknown as PoolConnection;
}
