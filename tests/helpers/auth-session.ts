import { randomUUID } from 'node:crypto';

import { signSessionToken } from '../../src/services/auth/session-token.js';
import { adminSessionCookieName, appSessionCookieName } from '../../src/utils/session-cookie.js';

import type { CreateCommunitySessionInput, CreateStaffSessionInput, RevokeStaffSessionInput, SessionRepository, StaffSession } from '../../src/repositories/auth/session.repository.interface.js';
import type { User } from '../../src/repositories/users/user.types.js';
import type { SessionRealm } from '../../src/utils/session-cookie.js';

export class TestSessionRepository implements SessionRepository {
    readonly communitySessions = new Map<string, CreateCommunitySessionInput>();
    readonly staffSessions = new Map<string, CreateStaffSessionInput & { createdAt: Date }>();
    readonly staffRevocations: RevokeStaffSessionInput[] = [];

    async createCommunitySession(input: CreateCommunitySessionInput): Promise<void> {
        this.communitySessions.set(input.id, input);
    }

    async createStaffSession(input: CreateStaffSessionInput): Promise<boolean> {
        this.staffSessions.set(input.id, { ...input, createdAt: new Date() });
        return true;
    }

    async isCommunitySessionActive(id: string, userId: number): Promise<boolean> {
        const session = this.communitySessions.get(id);
        return Boolean(session?.userId === userId && session.expiresAt.getTime() > Date.now());
    }

    async isStaffSessionActive(id: string, userId: number): Promise<boolean> {
        const session = this.staffSessions.get(id);
        return Boolean(session?.userId === userId && Boolean(session.webAuthnCredentialId) && session.mfaVerifiedAt instanceof Date && session.expiresAt.getTime() > Date.now());
    }

    async isStaffSessionRecentlyAuthenticated(id: string, userId: number, authenticatedAfter: Date): Promise<boolean> {
        const session = this.staffSessions.get(id);
        return Boolean(session?.userId === userId && Boolean(session.webAuthnCredentialId) && session.mfaVerifiedAt.getTime() >= authenticatedAfter.getTime() && session.expiresAt.getTime() > Date.now());
    }

    async findActiveStaffSessionsByUserId(userId: number): Promise<StaffSession[]> {
        return [...this.staffSessions.values()]
            .filter((session) => session.userId === userId && session.expiresAt.getTime() > Date.now())
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
            .map((session) => ({
                id: session.id,
                mfaMethod: 'webauthn',
                mfaVerifiedAt: session.mfaVerifiedAt,
                ipAddress: session.ipAddress,
                userAgent: session.userAgent,
                expiresAt: session.expiresAt,
                createdAt: session.createdAt
            }));
    }

    async revokeCommunitySession(id: string, userId: number): Promise<void> {
        if (this.communitySessions.get(id)?.userId === userId)
            this.communitySessions.delete(id);
    }

    async revokeAllCommunitySessions(userId: number, _revocationType: 'password_changed', exceptSessionId?: string): Promise<number> {
        let revokedCount = 0;

        for (const [id, session] of this.communitySessions) {
            if (session.userId !== userId || id === exceptSessionId || session.expiresAt.getTime() <= Date.now())
                continue;

            this.communitySessions.delete(id);
            revokedCount += 1;
        }

        return revokedCount;
    }

    async revokeStaffSession(input: RevokeStaffSessionInput): Promise<boolean> {
        this.staffRevocations.push(input);
        const session = this.staffSessions.get(input.id);
        if (session?.userId !== input.staffUserId || session.expiresAt.getTime() <= Date.now())
            return false;

        this.staffSessions.delete(input.id);
        return true;
    }

    async issueCookie(user: User, realm: SessionRealm, options: { mfaVerifiedAt?: Date } = {}): Promise<string> {
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + 60_000);

        if (realm === 'app')
            await this.createCommunitySession({ id, userId: user.id, expiresAt });
        else
            await this.createStaffSession({
                id,
                userId: user.id,
                sessionVersion: 1,
                expiresAt,
                webAuthnCredentialId: 'test-staff-credential',
                mfaVerifiedAt: options.mfaVerifiedAt ?? new Date(),
                ipAddress: '127.0.0.1',
                userAgent: 'Recipe Shelter test client'
            });

        const token = signSessionToken(user, realm, id);
        const cookieName = realm === 'app' ? appSessionCookieName : adminSessionCookieName;
        return `${cookieName}=${token}`;
    }
}
