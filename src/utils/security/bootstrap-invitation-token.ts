import crypto from 'node:crypto';

export function generateBootstrapInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function hashBootstrapInvitationToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}
