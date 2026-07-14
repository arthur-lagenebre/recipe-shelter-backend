import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UserRepositoryMysql } from '../../../src/repositories/users/user.repository.mysql.js';

import type { Pool } from 'mysql2/promise';

describe('UserRepositoryMysql', () => {
    it('rejects an unsupported account type before writing to MySQL', async () => {
        let executeCalls = 0;
        const repository = new UserRepositoryMysql({
            async execute() {
                executeCalls += 1;
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
        assert.equal(executeCalls, 0);
    });
});
