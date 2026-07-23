import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { executeMysqlScript } from './mysql-script.js';

import { env } from '../../../src/utils/env.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

const requesterUserId = 710;
const targetUserId = 711;
const reviewerUserId = 712;
const superAdminRoleId = 5;

function requirePrivilegeRequestsTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_privilege_requests`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the privilege requests integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe(
    'staff privilege change requests MySQL integration',
    { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' },
    () => {
        let connection: mysql.Connection;

        before(async () => {
            const databaseName = requirePrivilegeRequestsTestDatabaseName();
            connection = await mysql.createConnection({
                host: env.db.host,
                port: env.db.port,
                user: env.db.user,
                password: env.db.password,
                multipleStatements: true
            });

            await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

            const schemaPath = new URL('../../../database/migrations/1_create_schema.sql', import.meta.url);
            const seedPath = new URL('../../../database/seed.sql', import.meta.url);
            const schema = targetDatabase(await readFile(schemaPath, 'utf8'), databaseName);
            const seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

            await executeMysqlScript(connection, schema);
            await connection.query(seed);
            await connection.query(`INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES (?, 'privilege-requester@test.local', 'Privilege Requester', 'non-secret-test-hash', 'staff', 'inactive'), (?, 'privilege-target@test.local', 'Privilege Target', 'non-secret-test-hash', 'staff', 'inactive'), (?, 'privilege-reviewer@test.local', 'Privilege Reviewer', 'non-secret-test-hash', 'staff', 'inactive'); INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (?, ?)`, [requesterUserId, targetUserId, reviewerUserId, targetUserId, superAdminRoleId]);
        });

        after(async () => {
            if (connection) {
                await connection.query(`DROP DATABASE IF EXISTS \`${requirePrivilegeRequestsTestDatabaseName()}\``);
                await connection.end();
            }
        });

        it('applies the final schema then the central seed without activating the workflow', async () => {
            const databaseName = requirePrivilegeRequestsTestDatabaseName();
            const [columns] = await connection.query(`SELECT COLUMN_NAME AS ColumnName, DATA_TYPE AS DataType, IS_NULLABLE AS IsNullable, COLUMN_DEFAULT AS ColumnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'StaffPrivilegeChangeRequests' ORDER BY ORDINAL_POSITION`, [databaseName]);

            assert.deepEqual(columns, [
                { ColumnName: 'Id', DataType: 'bigint', IsNullable: 'NO', ColumnDefault: null },
                { ColumnName: 'TargetStaffUserId', DataType: 'bigint', IsNullable: 'NO', ColumnDefault: null },
                { ColumnName: 'RoleId', DataType: 'bigint', IsNullable: 'NO', ColumnDefault: null },
                { ColumnName: 'ChangeType', DataType: 'enum', IsNullable: 'NO', ColumnDefault: null },
                { ColumnName: 'Status', DataType: 'enum', IsNullable: 'NO', ColumnDefault: 'requested' },
                { ColumnName: 'RequestedByStaffUserId', DataType: 'bigint', IsNullable: 'NO', ColumnDefault: null },
                { ColumnName: 'RequestReason', DataType: 'text', IsNullable: 'NO', ColumnDefault: null },
                { ColumnName: 'ReviewedByStaffUserId', DataType: 'bigint', IsNullable: 'YES', ColumnDefault: null },
                { ColumnName: 'ReviewReason', DataType: 'text', IsNullable: 'YES', ColumnDefault: null },
                { ColumnName: 'RequestedAt', DataType: 'datetime', IsNullable: 'NO', ColumnDefault: 'CURRENT_TIMESTAMP(6)' },
                { ColumnName: 'ReviewedAt', DataType: 'datetime', IsNullable: 'YES', ColumnDefault: null }
            ]);

            const [seededRequests] = await connection.query(`SELECT COUNT(*) AS RequestCount FROM StaffPrivilegeChangeRequests`);
            assert.deepEqual(seededRequests, [{ RequestCount: 0 }]);
        });

        it('supports requested, approved and rejected records without applying role changes', async () => {
            const [approvedInsert] = await connection.execute<mysql.ResultSetHeader>(`INSERT INTO StaffPrivilegeChangeRequests (TargetStaffUserId, RoleId, ChangeType, RequestedByStaffUserId, RequestReason) VALUES (?, ?, 'revoke', ?, ?)`, [targetUserId, superAdminRoleId, requesterUserId, 'Prepare a two-person review without revoking access yet.']);
            const approvedRequestId = approvedInsert.insertId;

            const [requested] = await connection.query(`SELECT Status, ReviewedByStaffUserId, ReviewReason, ReviewedAt FROM StaffPrivilegeChangeRequests WHERE Id = ?`, [approvedRequestId]);
            assert.deepEqual(requested, [
                {
                    Status: 'requested',
                    ReviewedByStaffUserId: null,
                    ReviewReason: null,
                    ReviewedAt: null
                }
            ]);

            await connection.execute(`UPDATE StaffPrivilegeChangeRequests SET Status = 'approved', ReviewedByStaffUserId = ?, ReviewReason = ?, ReviewedAt = CURRENT_TIMESTAMP(6) WHERE Id = ? AND Status = 'requested'`, [reviewerUserId, 'The independent reviewer approves this prepared request.', approvedRequestId]);
            const [rejectedInsert] = await connection.execute<mysql.ResultSetHeader>(`INSERT INTO StaffPrivilegeChangeRequests (TargetStaffUserId, RoleId, ChangeType, RequestedByStaffUserId, RequestReason) VALUES (?, ?, 'grant', ?, ?)`, [targetUserId, superAdminRoleId, requesterUserId, 'Prepare a second decision state for rejection coverage.']);
            await connection.execute(`UPDATE StaffPrivilegeChangeRequests SET Status = 'rejected', ReviewedByStaffUserId = ?, ReviewReason = ?, ReviewedAt = CURRENT_TIMESTAMP(6) WHERE Id = ? AND Status = 'requested'`, [reviewerUserId, 'The independent reviewer rejects this prepared request.', rejectedInsert.insertId]);

            const [requests] = await connection.query(`SELECT Status, ChangeType, RequestedByStaffUserId, ReviewedByStaffUserId FROM StaffPrivilegeChangeRequests ORDER BY Id`);
            assert.deepEqual(requests, [
                {
                    Status: 'approved',
                    ChangeType: 'revoke',
                    RequestedByStaffUserId: requesterUserId,
                    ReviewedByStaffUserId: reviewerUserId
                },
                {
                    Status: 'rejected',
                    ChangeType: 'grant',
                    RequestedByStaffUserId: requesterUserId,
                    ReviewedByStaffUserId: reviewerUserId
                }
            ]);

            const [stillGranted] = await connection.query(`SELECT sr.StaffUserId, role.Code FROM StaffRoles AS sr INNER JOIN Roles AS role ON role.Id = sr.RoleId WHERE sr.StaffUserId = ? AND role.Code = 'SuperAdmin'`, [targetUserId]);
            assert.deepEqual(stillGranted, [{ StaffUserId: targetUserId, Code: 'SuperAdmin' }]);
        });

        it('rejects self-escalation and same-person review attempts', async () => {
            await assert.rejects(() =>
                connection.execute(
                    `INSERT INTO StaffPrivilegeChangeRequests
         (TargetStaffUserId, RoleId, ChangeType, RequestedByStaffUserId, RequestReason)
       VALUES (?, ?, 'grant', ?, ?)`,
                    [requesterUserId, superAdminRoleId, requesterUserId, 'A staff identity must not request its own privilege escalation.']
                )
            );

            for (const reviewedByStaffUserId of [requesterUserId, targetUserId]) {
                await assert.rejects(() =>
                    connection.execute(
                        `INSERT INTO StaffPrivilegeChangeRequests
           (TargetStaffUserId, RoleId, ChangeType, Status, RequestedByStaffUserId, RequestReason, ReviewedByStaffUserId, ReviewReason, ReviewedAt)
         VALUES (?, ?, 'grant', 'approved', ?, ?, ?, ?, CURRENT_TIMESTAMP(6))`,
                        [
                            targetUserId,
                            superAdminRoleId,
                            requesterUserId,
                            'A distinct staff identity must request the privilege change.',
                            reviewedByStaffUserId,
                            'A distinct independent reviewer must make this decision.'
                        ]
                    )
                );
            }
        });

        it('rejects inconsistent lifecycle states and invalid staff references', async () => {
            await assert.rejects(() =>
                connection.execute(
                    `INSERT INTO StaffPrivilegeChangeRequests
         (TargetStaffUserId, RoleId, ChangeType, Status, RequestedByStaffUserId, RequestReason)
       VALUES (?, ?, 'grant', 'approved', ?, ?)`,
                    [targetUserId, superAdminRoleId, requesterUserId, 'Approval metadata is mandatory for a final decision.']
                )
            );
            await assert.rejects(() =>
                connection.execute(
                    `INSERT INTO StaffPrivilegeChangeRequests
         (TargetStaffUserId, RoleId, ChangeType, RequestedByStaffUserId, RequestReason)
       VALUES (?, ?, 'grant', ?, ?)`,
                    [targetUserId, superAdminRoleId, 999_999, 'Every request actor must reference a staff identity.']
                )
            );
            await assert.rejects(() =>
                connection.execute(
                    `INSERT INTO StaffPrivilegeChangeRequests
         (TargetStaffUserId, RoleId, ChangeType, RequestedByStaffUserId, RequestReason)
       VALUES (?, ?, 'grant', ?, 'too short')`,
                    [targetUserId, superAdminRoleId, requesterUserId]
                )
            );
        });
    }
);
