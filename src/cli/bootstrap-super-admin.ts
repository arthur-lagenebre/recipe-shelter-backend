import { BOOTSTRAP_SUPER_ADMIN_USAGE, CommandUsageError, runBootstrapSuperAdminCommand } from './bootstrap-super-admin.command.js';
import { TerminalSecretPrompter } from './terminal-secret-prompter.js';
import { pool } from '../db/pool.js';
import { SuperAdminBootstrapRepositoryMysql } from '../repositories/bootstrap/super-admin-bootstrap.repository.mysql.js';
import { SuperAdminBootstrapService } from '../services/bootstrap/super-admin-bootstrap.service.js';
import { HttpError } from '../utils/errors.js';

async function main(): Promise<void> {
    const prompter = new TerminalSecretPrompter();

    try {
        const repository = new SuperAdminBootstrapRepositoryMysql(pool);
        const service = new SuperAdminBootstrapService(repository);

        await runBootstrapSuperAdminCommand(process.argv.slice(2), {
            service,
            prompter,
            writeOutput: (message) => process.stdout.write(`${message}\n`)
        });
    } catch (error) {
        process.stderr.write(`${formatCommandError(error)}\n`);

        if (error instanceof CommandUsageError)
            process.stderr.write(`${BOOTSTRAP_SUPER_ADMIN_USAGE}\n`);

        process.exitCode = 1;
    } finally {
        prompter.close();
        await pool.end();
    }
}

export function formatCommandError(error: unknown): string {
    if (error instanceof HttpError)
        return `${error.code ?? 'BOOTSTRAP_SUPER_ADMIN_FAILED'}: ${error.message}`;

    if (error instanceof CommandUsageError)
        return `BOOTSTRAP_SUPER_ADMIN_INVALID_ARGUMENTS: ${error.message}`;

    return 'BOOTSTRAP_SUPER_ADMIN_FAILED: The SuperAdmin could not be created.';
}

void main();
