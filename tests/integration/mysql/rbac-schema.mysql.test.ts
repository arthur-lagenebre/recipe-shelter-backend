import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import mysql from 'mysql2/promise';

import { PERMISSIONS } from '../../../src/security/permissions.js';
import { env } from '../../../src/utils/env.js';

const baseTestDatabaseName = process.env.TEST_DB_NAME?.trim() ?? '';
const mysqlEnabled = Boolean(baseTestDatabaseName);

function requireRbacTestDatabaseName(): string {
    if (!/^[a-zA-Z0-9_]+$/.test(baseTestDatabaseName))
        throw new Error('TEST_DB_NAME must contain only letters, numbers and underscores');
    if (!baseTestDatabaseName.toLowerCase().includes('test'))
        throw new Error('TEST_DB_NAME must contain "test"');
    if (baseTestDatabaseName === env.db.name)
        throw new Error('TEST_DB_NAME must be different from DB_NAME');

    const databaseName = `${baseTestDatabaseName}_rbac`;
    if (databaseName.length > 64)
        throw new Error('TEST_DB_NAME is too long for the RBAC integration database suffix');
    return databaseName;
}

function targetDatabase(sql: string, databaseName: string): string {
    return sql.replace(/USE\s+recipe_shelter\s*;/i, `USE \`${databaseName}\`;`);
}

describe('RBAC schema and seed integration', { skip: !mysqlEnabled && 'Set TEST_DB_NAME to run isolated MySQL tests' }, () => {
    let connection: mysql.Connection;
    let seed: string;

    before(async () => {
        const databaseName = requireRbacTestDatabaseName();
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
        seed = targetDatabase(await readFile(seedPath, 'utf8'), databaseName);

        await connection.query(schema);
        await connection.query(seed);
    });

    after(async () => {
        if (connection) {
            await connection.query(`DROP DATABASE IF EXISTS \`${requireRbacTestDatabaseName()}\``);
            await connection.end();
        }
    });

    it('bootstraps the final RBAC model from an empty database', async () => {
        const databaseName = requireRbacTestDatabaseName();
        const [tables] = await connection.query(
            `SELECT TABLE_NAME AS TableName
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME IN ('Roles', 'Permissions', 'StaffRoles', 'RolePermissions')
             ORDER BY TABLE_NAME`,
            [databaseName]
        );
        assert.deepEqual(
            (tables as Array<{ TableName: string }>).map((row) => row.TableName.toLowerCase()),
            ['permissions', 'rolepermissions', 'roles', 'staffroles']
        );

        const [legacyRoleColumns] = await connection.query(`SHOW COLUMNS FROM Users WHERE Field = 'RoleId'`);
        assert.deepEqual(legacyRoleColumns, []);

        const [roles] = await connection.query(
            `SELECT Code, Name, Description
             FROM Roles
             ORDER BY Code`
        );
        assert.deepEqual(roles, [
            {
                Code: 'CatalogManager',
                Name: 'Gestionnaire du catalogue',
                Description: 'Gère les catégories, ingrédients, tags et ustensiles'
            },
            {
                Code: 'CommentModerator',
                Name: 'Modérateur de commentaires',
                Description: 'Examine, masque, restaure et modifie les commentaires'
            },
            {
                Code: 'RecipeModerator',
                Name: 'Modérateur de recettes',
                Description: 'Examine, approuve, rejette et archive les recettes'
            },
            {
                Code: 'SuperAdmin',
                Name: 'Super administrateur',
                Description: 'Dispose explicitement de toutes les permissions administratives'
            },
            {
                Code: 'UserAdmin',
                Name: 'Administrateur des utilisateurs',
                Description: 'Consulte, suspend et réactive les comptes utilisateurs'
            }
        ]);

        const [permissions] = await connection.query(
            `SELECT Code, Description
             FROM Permissions
             ORDER BY Code`
        );
        assert.deepEqual(
            (permissions as Array<{ Code: string }>).map(({ Code }) => Code),
            [...Object.values(PERMISSIONS)].sort()
        );
        assert.ok(
            (permissions as Array<{ Description: string }>).every(({ Description }) => Description.trim().length > 0)
        );

        const [rolePermissions] = await connection.query(
            `SELECT r.Code AS RoleCode, p.Code AS PermissionCode
             FROM RolePermissions AS rp
             INNER JOIN Roles AS r ON r.Id = rp.RoleId
             INNER JOIN Permissions AS p ON p.Id = rp.PermissionId
             ORDER BY r.Code, p.Code`
        );
        const permissionsByRole: Record<string, string[]> = {};
        for (const { RoleCode, PermissionCode } of rolePermissions as Array<{ RoleCode: string; PermissionCode: string }>)
            (permissionsByRole[RoleCode] ??= []).push(PermissionCode);
        assert.deepEqual(permissionsByRole, {
            CatalogManager: [
                PERMISSIONS.catalogManage,
                PERMISSIONS.catalogRead
            ],
            CommentModerator: [
                PERMISSIONS.commentsModerate,
                PERMISSIONS.commentsRead,
                PERMISSIONS.commentsUpdate
            ],
            RecipeModerator: [
                PERMISSIONS.recipesArchive,
                PERMISSIONS.recipesModerate,
                PERMISSIONS.recipesRead
            ],
            SuperAdmin: [...Object.values(PERMISSIONS)].sort(),
            UserAdmin: [
                PERMISSIONS.usersModerate,
                PERMISSIONS.usersRead
            ]
        });

        const [adminRoles] = await connection.query(
            `SELECT r.Code
             FROM StaffRoles AS sr
             INNER JOIN Roles AS r ON r.Id = sr.RoleId
             WHERE sr.StaffUserId = 1
             ORDER BY r.Code`
        );
        assert.deepEqual(adminRoles, [{ Code: 'SuperAdmin' }]);

        const [adminPermissions] = await connection.query(
            `SELECT DISTINCT p.Code
             FROM StaffRoles AS sr
             INNER JOIN RolePermissions AS rp ON rp.RoleId = sr.RoleId
             INNER JOIN Permissions AS p ON p.Id = rp.PermissionId
             WHERE sr.StaffUserId = 1
             ORDER BY p.Code`
        );
        assert.deepEqual(
            (adminPermissions as Array<{ Code: string }>).map(({ Code }) => Code),
            [...Object.values(PERMISSIONS)].sort()
        );

        const [anonymousPermissions] = await connection.query(
            `SELECT COUNT(*) AS PermissionCount
             FROM StaffRoles AS sr
             INNER JOIN RolePermissions AS rp ON rp.RoleId = sr.RoleId
             WHERE sr.StaffUserId = 2`
        );
        assert.deepEqual(anonymousPermissions, [{ PermissionCount: 0 }]);
    });

    it('replays the seed without duplicating RBAC data', async () => {
        await connection.query(seed);

        const [roleInstances] = await connection.query(
            `SELECT Code, COUNT(*) AS InstanceCount
             FROM Roles
             GROUP BY Code
             ORDER BY Code`
        );
        assert.deepEqual(roleInstances, [
            { Code: 'CatalogManager', InstanceCount: 1 },
            { Code: 'CommentModerator', InstanceCount: 1 },
            { Code: 'RecipeModerator', InstanceCount: 1 },
            { Code: 'SuperAdmin', InstanceCount: 1 },
            { Code: 'UserAdmin', InstanceCount: 1 }
        ]);

        const [adminRoleAssignments] = await connection.query(
            `SELECT COUNT(*) AS AssignmentCount
             FROM StaffRoles
             WHERE StaffUserId = 1`
        );
        assert.deepEqual(adminRoleAssignments, [{ AssignmentCount: 1 }]);

        const [permissionInstances] = await connection.query(
            `SELECT Code, COUNT(*) AS InstanceCount
             FROM Permissions
             GROUP BY Code
             ORDER BY Code`
        );
        assert.deepEqual(
            permissionInstances,
            [...Object.values(PERMISSIONS)].sort().map((Code) => ({ Code, InstanceCount: 1 }))
        );

        const [superAdminPermissions] = await connection.query(
            `SELECT COUNT(*) AS PermissionCount
             FROM RolePermissions AS rp
             INNER JOIN Roles AS r ON r.Id = rp.RoleId
             WHERE r.Code = 'SuperAdmin'`
        );
        assert.deepEqual(superAdminPermissions, [{ PermissionCount: Object.values(PERMISSIONS).length }]);
    });

    it('enforces unique assignments, foreign keys and default deny', async () => {
        await connection.query(
            `INSERT INTO Users (Id, Mail, Username, Password, AccountType, Status) VALUES
                (100, 'community-rbac@test.local', 'community-rbac', 'hash', 'community', 'active'),
                (101, 'staff-rbac@test.local', 'staff-rbac', 'hash', 'staff', 'active')`
        );

        const [defaultRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 101`);
        assert.deepEqual(defaultRoles, []);

        await connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 1), (101, 2)`);
        const [staffRoles] = await connection.query(`SELECT RoleId FROM StaffRoles WHERE StaffUserId = 101 ORDER BY RoleId`);
        assert.deepEqual(staffRoles, [{ RoleId: 1 }, { RoleId: 2 }]);

        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (100, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO StaffRoles (StaffUserId, RoleId) VALUES (101, 999999)`));
        await assert.rejects(() => connection.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (5, 1)`));
        await assert.rejects(() => connection.query(`INSERT INTO RolePermissions (RoleId, PermissionId) VALUES (1, 999999)`));
        await assert.rejects(() => connection.query(
            `INSERT INTO Roles (Code, Name, Description)
             VALUES ('RECIPEMODERATOR', 'Autre rôle recettes', 'Duplicate code')`
        ));
        await assert.rejects(() => connection.query(
            `INSERT INTO Roles (Code, Name, Description)
             VALUES ('OtherRecipeModerator', 'MODÉRATEUR DE RECETTES', 'Duplicate name')`
        ));
        await assert.rejects(() => connection.query(`INSERT INTO Permissions (Code, Description) VALUES ('USERS.READ', 'Duplicate')`));
    });
});
