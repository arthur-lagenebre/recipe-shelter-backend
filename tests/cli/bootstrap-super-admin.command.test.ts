import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BOOTSTRAP_SUPER_ADMIN_USAGE, CommandUsageError, parseBootstrapSuperAdminArgs, runBootstrapSuperAdminCommand } from '../../src/cli/bootstrap-super-admin.command.js';

describe('bootstrap SuperAdmin command', () => {
    it('accepts only the non-secret identity arguments', () => {
        assert.deepEqual(parseBootstrapSuperAdminArgs(['--email', 'first@example.com', '--username=first-admin']), {
            help: false,
            mail: 'first@example.com',
            username: 'first-admin'
        });
    });

    it('never accepts or repeats secrets supplied as arguments', () => {
        for (const argument of ['--password=NeverPrintThis42!', '--token=NeverPrintThisToken']) {
            assert.throws(
                () => parseBootstrapSuperAdminArgs(['--email=first@example.com', '--username=first-admin', argument]),
                (error) => {
                    assert.ok(error instanceof CommandUsageError);
                    assert.doesNotMatch(error.message, /NeverPrintThis/);
                    return true;
                }
            );
        }
    });

    it('creates the invitation without receiving or writing its token', async () => {
        const outputs: string[] = [];
        let receivedInput: { mail: string; username: string } | null = null;

        await runBootstrapSuperAdminCommand(['--email=first@example.com', '--username=first-admin'], {
            service: {
                async bootstrap(input) {
                    receivedInput = input;
                    return { userId: 42 };
                }
            },
            writeOutput(message) {
                outputs.push(message);
            }
        });

        assert.deepEqual(receivedInput, {
            mail: 'first@example.com',
            username: 'first-admin'
        });
        assert.deepEqual(outputs, ['SuperAdmin bootstrap invitation sent successfully (user ID: 42).']);
        assert.doesNotMatch(outputs.join('\n'), /token=/i);
    });

    it('shows help without calling the service', async () => {
        let serviceCalled = false;
        const outputs: string[] = [];

        await runBootstrapSuperAdminCommand(['--help'], {
            service: {
                async bootstrap() {
                    serviceCalled = true;
                    return { userId: 42 };
                }
            },
            writeOutput(message) {
                outputs.push(message);
            }
        });

        assert.equal(serviceCalled, false);
        assert.deepEqual(outputs, [BOOTSTRAP_SUPER_ADMIN_USAGE]);
    });
});
