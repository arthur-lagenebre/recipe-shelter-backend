import type { SuperAdminBootstrapService } from '../services/bootstrap/super-admin-bootstrap.service.js';

export const BOOTSTRAP_SUPER_ADMIN_USAGE = `Usage:
  npm run bootstrap:superadmin -- --email <email> --username <username>

The one-time invitation is sent by email. Its token is never written to the command output, and MFA enrollment is mandatory.`;

export class CommandUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandUsageError';
    }
}

type CommandDependencies = {
    service: Pick<SuperAdminBootstrapService, 'bootstrap'>;
    writeOutput(message: string): void;
};

type CommandOptions = { help: true } | { help: false; mail: string; username: string };

export function parseBootstrapSuperAdminArgs(args: string[]): CommandOptions {
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return { help: true };

    let mail: string | undefined;
    let username: string | undefined;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];

        if (argument === '--email') {
            if (mail !== undefined) throw invalidArguments();
            mail = readOptionValue(args, index);
            index += 1;
            continue;
        }

        if (argument?.startsWith('--email=')) {
            if (mail !== undefined) throw invalidArguments();
            mail = argument.slice('--email='.length);
            continue;
        }

        if (argument === '--username') {
            if (username !== undefined) throw invalidArguments();
            username = readOptionValue(args, index);
            index += 1;
            continue;
        }

        if (argument?.startsWith('--username=')) {
            if (username !== undefined) throw invalidArguments();
            username = argument.slice('--username='.length);
            continue;
        }

        throw invalidArguments();
    }

    if (!mail || !username) throw invalidArguments();

    return { help: false, mail, username };
}

export async function runBootstrapSuperAdminCommand(args: string[], dependencies: CommandDependencies): Promise<void> {
    const options = parseBootstrapSuperAdminArgs(args);

    if (options.help) {
        dependencies.writeOutput(BOOTSTRAP_SUPER_ADMIN_USAGE);
        return;
    }

    const result = await dependencies.service.bootstrap({
        mail: options.mail,
        username: options.username
    });

    dependencies.writeOutput(`SuperAdmin bootstrap invitation sent successfully (user ID: ${result.userId}).`);
}

function readOptionValue(args: string[], optionIndex: number): string {
    const value = args[optionIndex + 1];

    if (!value || value.startsWith('-')) throw invalidArguments();

    return value;
}

function invalidArguments(): CommandUsageError {
    return new CommandUsageError('Invalid arguments. Only --email and --username are accepted.');
}
