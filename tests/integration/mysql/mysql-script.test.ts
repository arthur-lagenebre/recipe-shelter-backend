import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executeMysqlScript, splitMysqlScript } from './mysql-script.js';

describe('MySQL script execution', () => {
    it('removes client delimiter directives and keeps compound trigger bodies intact', () => {
        const statements = splitMysqlScript(`
            -- A regular statement may contain delimiter-looking text in a value.
            INSERT INTO Messages (Body) VALUES ('still; one statement');

            DELIMITER $$
            CREATE TRIGGER messages_audit_AI
            AFTER INSERT ON Messages
            FOR EACH ROW
            BEGIN
              INSERT INTO AuditMessages (MessageId, Body)
              VALUES (NEW.Id, CONCAT('created; ', NEW.Body));
            END$$
            DELIMITER ;

            SELECT 'done';
        `);

        assert.equal(statements.length, 3);
        assert.match(statements[0] ?? '', /^-- A regular statement/);
        assert.match(statements[1] ?? '', /^CREATE TRIGGER messages_audit_AI/);
        assert.match(statements[1] ?? '', /VALUES \(NEW\.Id, CONCAT\('created; ', NEW\.Body\)\);/);
        assert.equal(statements[2], "SELECT 'done'");
        assert.doesNotMatch(statements.join('\n'), /\bDELIMITER\b/);
    });

    it('executes each parsed statement separately and in source order', async () => {
        const queries: string[] = [];
        const connection = {
            async query(sql: string): Promise<unknown> {
                queries.push(sql);
                return [];
            }
        };

        await executeMysqlScript(connection, 'USE test_database; SELECT 1;');

        assert.deepEqual(queries, ['USE test_database', 'SELECT 1']);
    });
});
