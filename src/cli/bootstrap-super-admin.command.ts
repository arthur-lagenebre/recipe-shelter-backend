import { badRequest } from '../utils/errors.js';

import type { SuperAdminBootstrapService } from '../services/bootstrap/super-admin-bootstrap.service.js';

export const BOOTSTRAP_SUPER_ADMIN_USAGE = `Usage:
  npm run bootstrap:superadmin -- --email <email> --username <username>

The password and its confirmation are requested interactively and are never accepted as arguments.`;

export class CommandUsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandUsageError';
    }
}

export type SecretPrompter = {
    readSecret(label: string): Promise<string>;
};

type CommandDependencies = {
    service: Pick<SuperAdminBootstrapService, 'bootstrap'>;
    prompter: SecretPrompter;
    writeOutput(message: string): void;
};

type CommandOptions =
    | { help: true }
    | { help: false; mail: string; username: string };

export function parseBootstrapSuperAdminArgs(args: string[]): CommandOptions {
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
        return { help: true };

    let mail: string | undefined;
    let username: string | undefined;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];

        if (argument === '--email') {
            if (mail !== undefined)
                throw invalidArguments();
            mail = readOptionValue(args, index);
            index += 1;
            continue;
        }

        if (argument?.startsWith('--email=')) {
            if (mail !== undefined)
                throw invalidArguments();
            mail = argument.slice('--email='.length);
            continue;
        }

        if (argument === '--username') {
            if (username !== undefined)
                throw invalidArguments();
            username = readOptionValue(args, index);
            index += 1;
            continue;
        }

        if (argument?.startsWith('--username=')) {
            if (username !== undefined)
                throw invalidArguments();
            username = argument.slice('--username='.length);
            continue;
        }

        throw invalidArguments();
    }

    if (!mail || !username)
        throw invalidArguments();

    return { help: false, mail, username };
}

export async function runBootstrapSuperAdminCommand(args: string[], dependencies: CommandDependencies): Promise<void> {
    const options = parseBootstrapSuperAdminArgs(args);

    if (options.help) {
        dependencies.writeOutput(BOOTSTRAP_SUPER_ADMIN_USAGE);
        return;
    }

    const password = await dependencies.prompter.readSecret('Password: ');
    const passwordConfirmation = await dependencies.prompter.readSecret('Confirm password: ');

    if (password !== passwordConfirmation)
        throw badRequest('Password confirmation does not match', 'BOOTSTRAP_SUPER_ADMIN_PASSWORD_MISMATCH');

    const result = await dependencies.service.bootstrap({
        mail: options.mail,
        username: options.username,
        password
    });

    dependencies.writeOutput(`SuperAdmin created successfully (user ID: ${result.userId}).`);
}

function readOptionValue(args: string[], optionIndex: number): string {
    const value = args[optionIndex + 1];

    if (!value || value.startsWith('-'))
        throw invalidArguments();

    return value;
}

function invalidArguments(): CommandUsageError {
    return new CommandUsageError(
        'Invalid arguments. Only --email and --username are accepted; enter the password interactively.'
    );
}
