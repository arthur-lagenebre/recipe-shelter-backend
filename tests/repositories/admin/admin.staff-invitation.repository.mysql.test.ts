import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StaffInvitationRepositoryMysql } from '../../../src/repositories/admin/admin.staff-invitation.repository.mysql.js';

import type { CreateStaffInvitationInput } from '../../../src/repositories/admin/admin.staff-invitation.repository.interface.js';
import type { Pool } from 'mysql2/promise';

type FakeOptions = {
    roleRows?: unknown[];
    identityRows?: unknown[];
    invitationRows?: unknown[];
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
        async beginTransaction() {
            return undefined;
        },
        async execute(sql: string, params: unknown) {
            statements.push({ sql, params });

            if (/FROM Roles/.test(sql)) {
                return [
                    options.roleRows ?? [
                        { Id: 1, Code: 'RecipeModerator', Name: 'Modérateur de recettes' },
                        { Id: 2, Code: 'CommentModerator', Name: 'Modérateur de commentaires' },
                        { Id: 3, Code: 'UserAdmin', Name: 'Administrateur des utilisateurs' }
                    ]
                ];
            }
            if (/FROM Users AS u/.test(sql)) return [options.identityRows ?? []];
            if (/INSERT INTO Users/.test(sql)) {
                if (options.userInsertError) throw options.userInsertError;
                return [{ insertId: 42, affectedRows: 1 }];
            }
            if (/INSERT INTO StaffInvitations/.test(sql)) return [{ insertId: 7, affectedRows: 1 }];
            if (/FROM StaffInvitations/.test(sql)) {
                return [
                    options.invitationRows ?? [
                        {
                            Id: 7,
                            StaffUserId: 42,
                            ExpiresAt: new Date('2026-07-18T10:00:00.000Z'),
                            CreatedAt: new Date('2026-07-17T10:00:00.000Z')
                        }
                    ]
                ];
            }

            return [{ affectedRows: 1 }];
        },
        async commit() {
            commits += 1;
        },
        async rollback() {
            rollbacks += 1;
        },
        release() {
            releases += 1;
        }
    };
    const pool = {
        async getConnection() {
            return connection;
        }
    } as unknown as Pool;

    return {
        pool,
        statements,
        counts: () => ({ commits, rollbacks, releases })
    };
}

const input: CreateStaffInvitationInput = {
    email: 'staff.member@example.com',
    displayName: 'Staff Member',
    roleCodes: ['RecipeModerator', 'CommentModerator'],
    tokenHash: 'a'.repeat(64),
    invitationTtlMinutes: 1440,
    createdByStaffUserId: 9
};

describe('StaffInvitationRepositoryMysql', () => {
    it('atomically creates the invited identity, initial roles and expiring invitation', async () => {
        const fake = createPool();
        const repository = new StaffInvitationRepositoryMysql(fake.pool);

        const result = await repository.create(input);

        assert.equal(result.status, 'created');
        if (result.status !== 'created') return;
        assert.deepEqual(result.invitation, {
            id: 7,
            staffUserId: 42,
            email: 'staff.member@example.com',
            displayName: 'Staff Member',
            status: 'invited',
            roles: [
                { id: 1, code: 'RecipeModerator', name: 'Modérateur de recettes' },
                { id: 2, code: 'CommentModerator', name: 'Modérateur de commentaires' }
            ],
            expiresAt: new Date('2026-07-18T10:00:00.000Z'),
            createdAt: new Date('2026-07-17T10:00:00.000Z')
        });
        assert.match(fake.statements[0]?.sql ?? '', /FROM Roles[\s\S]+FOR UPDATE/);
        assert.match(fake.statements[1]?.sql ?? '', /FROM Users AS u[\s\S]+FOR UPDATE/);
        assert.deepEqual(fake.statements[1]?.params, [
            'staff.member@example.com',
            'Staff Member',
            'staff.member@example.com',
            'Staff Member'
        ]);
        assert.match(fake.statements[2]?.sql ?? '', /NULL, 'staff', 'inactive', NULL/);
        assert.deepEqual(fake.statements[2]?.params, ['staff.member@example.com', 'Staff Member']);
        assert.match(fake.statements[3]?.sql ?? '', /INSERT INTO StaffRoles/);
        assert.deepEqual(fake.statements[3]?.params, [42, 1, 42, 2]);
        assert.match(fake.statements[4]?.sql ?? '', /CreatedByStaffUserId/);
        assert.match(fake.statements[4]?.sql ?? '', /DATE_ADD\(CURRENT_TIMESTAMP, INTERVAL \? MINUTE\)/);
        assert.deepEqual(fake.statements[4]?.params, [42, 9, 'a'.repeat(64), 1440]);
        assert.equal(JSON.stringify(fake.statements).includes('raw-token'), false);
        assert.deepEqual(fake.counts(), { commits: 1, rollbacks: 0, releases: 1 });
    });

    it('distinguishes an existing invitation from another existing email', async () => {
        const existingInvitation = createPool({
            identityRows: [
                {
                    AccountType: 'staff',
                    StaffStatus: 'invited',
                    InvitationId: 7,
                    InvitationUsedAt: null,
                    EmailMatches: 1,
                    DisplayNameMatches: 0
                }
            ]
        });
        assert.deepEqual(await new StaffInvitationRepositoryMysql(existingInvitation.pool).create(input), {
            status: 'invitation_exists',
            invitationId: 7
        });
        assert.equal(
            existingInvitation.statements.some(({ sql }) => /INSERT INTO Users/.test(sql)),
            false
        );

        const emailTaken = createPool({
            identityRows: [
                {
                    AccountType: 'community',
                    StaffStatus: null,
                    InvitationId: null,
                    InvitationUsedAt: null,
                    EmailMatches: 1,
                    DisplayNameMatches: 0
                }
            ]
        });
        assert.deepEqual(await new StaffInvitationRepositoryMysql(emailTaken.pool).create(input), { status: 'email_taken' });
    });

    it('rejects display-name conflicts and missing role codes before account creation', async () => {
        const displayNameTaken = createPool({
            identityRows: [
                {
                    AccountType: 'community',
                    StaffStatus: null,
                    InvitationId: null,
                    InvitationUsedAt: null,
                    EmailMatches: 0,
                    DisplayNameMatches: 1
                }
            ]
        });
        assert.deepEqual(await new StaffInvitationRepositoryMysql(displayNameTaken.pool).create(input), { status: 'display_name_taken' });

        const missingRole = createPool();
        assert.deepEqual(
            await new StaffInvitationRepositoryMysql(missingRole.pool).create({
                ...input,
                roleCodes: ['UnknownRole']
            }),
            { status: 'roles_missing', roleCodes: ['UnknownRole'] }
        );
        assert.equal(
            missingRole.statements.some(({ sql }) => /FROM Users/.test(sql)),
            false
        );
    });

    it('maps concurrent unique identity conflicts and rolls back its own transaction', async () => {
        const duplicateError = Object.assign(new Error("Duplicate entry for key 'users_mail_UK'"), {
            code: 'ER_DUP_ENTRY'
        });
        const fake = createPool({ userInsertError: duplicateError });

        assert.deepEqual(await new StaffInvitationRepositoryMysql(fake.pool).create(input), { status: 'email_taken' });
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });

    it('rolls back and preserves unexpected persistence errors', async () => {
        const persistenceError = new Error('database unavailable');
        const fake = createPool({ userInsertError: persistenceError });

        await assert.rejects(() => new StaffInvitationRepositoryMysql(fake.pool).create(input), persistenceError);
        assert.deepEqual(fake.counts(), { commits: 0, rollbacks: 1, releases: 1 });
    });
});
