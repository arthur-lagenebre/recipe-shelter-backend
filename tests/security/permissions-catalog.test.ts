import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { PERMISSIONS } from '../../src/security/permissions.js';

const schemaPath = new URL('../../database/migrations/1_create_schema.sql', import.meta.url);
const seedPath = new URL('../../database/seed.sql', import.meta.url);

describe('permission catalog', () => {
    it('keeps stable application permission codes synchronized with the central seed', async () => {
        const seed = await readFile(seedPath, 'utf8');
        const permissionInsert = seed.match(/INSERT INTO Permissions[\s\S]+?(?=AS new_permissions)/)?.[0];

        assert.ok(permissionInsert, 'The central seed must insert the permission catalog');
        const seededPermissions = [...permissionInsert.matchAll(/\(\d+,\s*'([^']+)',\s*"([^"\r\n]+)"\)/g)]
            .map((match) => ({ code: match[1], description: match[2] }));
        const seededCodes = seededPermissions.map(({ code }) => code);
        const applicationCodes = Object.values(PERMISSIONS);

        assert.deepEqual(seededCodes, applicationCodes);
        assert.ok(seededPermissions.every(({ description }) => description.trim().length > 0));
        assert.equal(new Set(applicationCodes).size, applicationCodes.length);
        assert.ok(applicationCodes.every((code) => /^[a-z]+(?:\.[a-z]+)+$/.test(code)));
        assert.deepEqual(
            [...new Set(applicationCodes.map((code) => code.split('.')[0]))].sort(),
            ['audit', 'catalog', 'comments', 'recipes', 'staff', 'system', 'users']
        );
    });

    it('keeps all initial permissions out of the structural schema', async () => {
        const schema = await readFile(schemaPath, 'utf8');

        assert.doesNotMatch(schema, /INSERT\s+INTO\s+Permissions\b/i);
        assert.doesNotMatch(schema, /INSERT\s+INTO\s+RolePermissions\b/i);
    });
});
