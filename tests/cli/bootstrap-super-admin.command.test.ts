import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    BOOTSTRAP_SUPER_ADMIN_USAGE,
    CommandUsageError,
    parseBootstrapSuperAdminArgs,
    runBootstrapSuperAdminCommand
} from '../../src/cli/bootstrap-super-admin.command.js';
import { HttpError } from '../../src/utils/errors.js';

describe('bootstrap SuperAdmin command', () => {
    it('accepts only the non-secret identity arguments', () => {
        assert.deepEqual(
            parseBootstrapSuperAdminArgs(['--email', 'first@example.com', '--username=first-admin']),
            { help: false, mail: 'first@example.com', username: 'first-admin' }
        );
    });

    it('never accepts or repeats a password supplied as an argument', () => {
        const secret = 'NeverPrintThis42!';

        assert.throws(
            () => parseBootstrapSuperAdminArgs([
                '--email=first@example.com',
                '--username=first-admin',
                `--password=${secret}`
            ]),
            (error) => {
                assert.ok(error instanceof CommandUsageError);
                assert.doesNotMatch(error.message, new RegExp(secret));
                return true;
            }
        );
    });

    it('reads password and confirmation interactively without writing the secret', async () => {
        const secret = 'StrongPass42!';
        const labels: string[] = [];
        const outputs: string[] = [];
        let receivedInput: { mail: string; username: string; password: string } | null = null;

        await runBootstrapSuperAdminCommand(
            ['--email=first@example.com', '--username=first-admin'],
            {
                service: {
                    async bootstrap(input) {
                        receivedInput = input;
                        return { userId: 42 };
                    }
                },
                prompter: {
                    async readSecret(label) {
                        labels.push(label);
                        return secret;
                    }
                },
                writeOutput(message) {
                    outputs.push(message);
                }
            }
        );

        assert.deepEqual(labels, ['Password: ', 'Confirm password: ']);
        assert.deepEqual(receivedInput, {
            mail: 'first@example.com',
            username: 'first-admin',
            password: secret
        });
        assert.equal(outputs.join('\n').includes(secret), false);
        assert.deepEqual(outputs, ['SuperAdmin created successfully (user ID: 42).']);
    });

    it('rejects a mismatched confirmation before calling the service', async () => {
        let serviceCalled = false;
        const secrets = ['StrongPass42!', 'DifferentPass42!'];

        await assert.rejects(
            () => runBootstrapSuperAdminCommand(
                ['--email=first@example.com', '--username=first-admin'],
                {
                    service: {
                        async bootstrap() {
                            serviceCalled = true;
                            return { userId: 42 };
                        }
                    },
                    prompter: {
                        async readSecret() {
                            return secrets.shift() ?? '';
                        }
                    },
                    writeOutput() { return undefined; }
                }
            ),
            (error) => {
                assert.ok(error instanceof HttpError);
                assert.equal(error.code, 'BOOTSTRAP_SUPER_ADMIN_PASSWORD_MISMATCH');
                return true;
            }
        );
        assert.equal(serviceCalled, false);
    });

    it('shows help without reading a password or calling the service', async () => {
        let secretRead = false;
        let serviceCalled = false;
        const outputs: string[] = [];

        await runBootstrapSuperAdminCommand(['--help'], {
            service: {
                async bootstrap() {
                    serviceCalled = true;
                    return { userId: 42 };
                }
            },
            prompter: {
                async readSecret() {
                    secretRead = true;
                    return '';
                }
            },
            writeOutput(message) {
                outputs.push(message);
            }
        });

        assert.equal(secretRead, false);
        assert.equal(serviceCalled, false);
        assert.deepEqual(outputs, [BOOTSTRAP_SUPER_ADMIN_USAGE]);
    });
});
