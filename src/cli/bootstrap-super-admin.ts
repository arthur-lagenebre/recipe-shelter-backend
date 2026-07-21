import { BOOTSTRAP_SUPER_ADMIN_USAGE, CommandUsageError, runBootstrapSuperAdminCommand } from './bootstrap-super-admin.command.js';
import { pool } from '../db/pool.js';
import { SuperAdminBootstrapRepositoryMysql } from '../repositories/bootstrap/super-admin-bootstrap.repository.mysql.js';
import { SuperAdminBootstrapService } from '../services/bootstrap/super-admin-bootstrap.service.js';
import { SmtpMailService } from '../services/mail/mail.service.js';
import { env } from '../utils/env.js';
import { HttpError } from '../utils/errors.js';

async function main(): Promise<void> {
    try {
        const repository = new SuperAdminBootstrapRepositoryMysql(pool);
        const service = new SuperAdminBootstrapService(repository, new SmtpMailService(env.smtp), env.http.frontendBaseUrl);

        await runBootstrapSuperAdminCommand(process.argv.slice(2), {
            service,
            writeOutput: (message) => process.stdout.write(`${message}\n`)
        });
    } catch (error) {
        process.stderr.write(`${formatCommandError(error)}\n`);

        if (error instanceof CommandUsageError)
            process.stderr.write(`${BOOTSTRAP_SUPER_ADMIN_USAGE}\n`);

        process.exitCode = 1;
    } finally {
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
