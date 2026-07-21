import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StaffMfaService } from '../../../src/services/auth/staff-mfa.service.js';
import { HttpError } from '../../../src/utils/errors.js';

import type { CompleteStaffMfaAuthenticationInput, CompleteStaffMfaEnrollmentInput, CreateStaffWebAuthnChallengeInput, StaffMfaEnrollmentContext, StaffMfaRepository, StaffWebAuthnChallenge, StaffWebAuthnCredential } from '../../../src/repositories/auth/staff-mfa.repository.interface.js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

const now = new Date('2026-07-16T12:00:00.000Z');
const enrollmentContext: StaffMfaEnrollmentContext = {
    invitationId: 7,
    staffUserId: 42,
    mail: 'staff@example.com',
    username: 'staff-user'
};
const passkey: StaffWebAuthnCredential = {
    credentialId: 'credential-1',
    staffUserId: 42,
    publicKey: new Uint8Array([1, 2, 3]),
    signatureCounter: 4,
    transports: ['usb'],
    deviceType: 'singleDevice',
    backedUp: false,
    aaguid: '00000000-0000-0000-0000-000000000000'
};

class FakeStaffMfaRepository implements StaffMfaRepository {
    enrollmentContext: StaffMfaEnrollmentContext | null = enrollmentContext;
    credentials: StaffWebAuthnCredential[] = [];
    registrationChallenge: StaffWebAuthnChallenge | null = null;
    authenticationChallenge: StaffWebAuthnChallenge | null = null;
    savedChallenge: CreateStaffWebAuthnChallengeInput | null = null;
    enrollmentInput: CompleteStaffMfaEnrollmentInput | null = null;
    authenticationInput: CompleteStaffMfaAuthenticationInput | null = null;
    enrollmentCompleted = true;
    authenticationCompleted = true;
    receivedInvitationHash: string | null = null;

    async findEnrollmentContext(invitationTokenHash: string) {
        this.receivedInvitationHash = invitationTokenHash;
        return this.enrollmentContext;
    }

    async findCredentialsByStaffUserId() {
        return this.credentials;
    }

    async findCredential(staffUserId: number, credentialId: string) {
        return (this.credentials.find((credential) => credential.staffUserId === staffUserId && credential.credentialId === credentialId) ?? null);
    }

    async saveChallenge(input: CreateStaffWebAuthnChallengeInput) {
        this.savedChallenge = input;
        return true;
    }

    async findRegistrationChallenge() {
        return this.registrationChallenge;
    }

    async findAuthenticationChallenge() {
        return this.authenticationChallenge;
    }

    async completeEnrollment(input: CompleteStaffMfaEnrollmentInput) {
        this.enrollmentInput = input;
        return this.enrollmentCompleted;
    }

    async completeAuthentication(input: CompleteStaffMfaAuthenticationInput) {
        this.authenticationInput = input;
        return this.authenticationCompleted;
    }
}

function registrationResponse(): RegistrationResponseJSON {
    return {
        id: 'credential-1',
        rawId: 'credential-1',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
            clientDataJSON: 'client-data',
            attestationObject: 'attestation',
            transports: ['usb']
        }
    };
}

function authenticationResponse(userHandle?: string): AuthenticationResponseJSON {
    return {
        id: 'credential-1',
        rawId: 'credential-1',
        type: 'public-key',
        clientExtensionResults: {},
        response: {
            clientDataJSON: 'client-data',
            authenticatorData: 'authenticator-data',
            signature: 'signature',
            ...(userHandle ? { userHandle } : {})
        }
    };
}

function createService(repository: FakeStaffMfaRepository, calls: Record<string, unknown> = {}) {
    return new StaffMfaService(repository, {
        challengeTtlMs: 120_000,
        now: () => now,
        randomId: () => 'flow-1',
        hashInvitationToken: (token) => `hash:${token}`,
        hashPassword: async (password) => `password-hash:${password}`,
        webAuthnOrigin: 'https://staff.example.com',
        webAuthnRpId: 'staff.example.com',
        webAuthnRpName: 'Recipe Shelter Staff',
        webAuthn: {
            async generateRegistrationOptions(options: unknown) {
                calls.registrationOptions = options;
                return { challenge: 'registration-challenge' } as never;
            },
            async verifyRegistrationResponse(options: unknown) {
                calls.registrationVerification = options;
                if (calls.registrationFailure)
                    throw new Error('invalid registration');
                return {
                    verified: true,
                    registrationInfo: {
                        credential: {
                            id: 'credential-1',
                            publicKey: new Uint8Array([1, 2, 3]),
                            counter: 0,
                            transports: ['usb']
                        },
                        credentialDeviceType: 'singleDevice',
                        credentialBackedUp: false,
                        aaguid: passkey.aaguid
                    }
                } as never;
            },
            async generateAuthenticationOptions(options: unknown) {
                calls.authenticationOptions = options;
                return { challenge: 'authentication-challenge' } as never;
            },
            async verifyAuthenticationResponse(options: unknown) {
                calls.authenticationVerification = options;
                if (calls.authenticationFailure)
                    throw new Error('invalid assertion');
                return {
                    verified: true,
                    authenticationInfo: { newCounter: 5 }
                } as never;
            }
        } as never
    });
}

function assertHttpError(error: unknown, code: string, status: number): boolean {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, status);
    return true;
}

describe('StaffMfaService WebAuthn enrollment', () => {
    it('rejects challenge lifetimes longer than ten minutes', () => {
        assert.throws(() => new StaffMfaService(new FakeStaffMfaRepository(), { challengeTtlMs: 600_001 }), /at most 10 minutes/);
    });

    it('creates a short-lived registration challenge bound to the invitation and requires user verification', async () => {
        const repository = new FakeStaffMfaRepository();
        const calls: Record<string, unknown> = {};
        const service = createService(repository, calls);

        const result = await service.beginEnrollment(' invitation-token ');

        assert.equal(repository.receivedInvitationHash, 'hash:invitation-token');
        assert.deepEqual(result, { flowId: 'flow-1', publicKey: { challenge: 'registration-challenge' } });
        assert.deepEqual(repository.savedChallenge, {
            id: 'flow-1',
            staffUserId: 42,
            invitationId: 7,
            purpose: 'registration',
            expectedSessionVersion: null,
            challenge: 'registration-challenge',
            ttlMs: 120_000
        });
        assert.deepEqual(calls.registrationOptions, {
            rpName: 'Recipe Shelter Staff',
            rpID: 'staff.example.com',
            userID: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 42]),
            userName: 'staff@example.com',
            userDisplayName: 'staff-user',
            timeout: 120_000,
            attestationType: 'none',
            authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
            excludeCredentials: []
        });
    });

    it('rejects missing, expired, or already used invitations', async () => {
        const repository = new FakeStaffMfaRepository();
        const service = createService(repository);

        await assert.rejects(() => service.beginEnrollment(' '), (error) => assertHttpError(error, 'STAFF_MFA_INVITATION_TOKEN_REQUIRED', 400));

        repository.enrollmentContext = null;
        await assert.rejects(() => service.beginEnrollment('invalid'), (error) => assertHttpError(error, 'STAFF_MFA_INVITATION_INVALID', 400));
    });

    it('activates enrollment only after a user-verified registration response', async () => {
        const repository = new FakeStaffMfaRepository();
        repository.registrationChallenge = {
            id: 'flow-1',
            staffUserId: 42,
            invitationId: 7,
            sessionVersion: 1,
            challenge: 'registration-challenge',
            expiresAt: new Date('2026-07-16T12:02:00.000Z')
        };
        const calls: Record<string, unknown> = {};
        const service = createService(repository, calls);

        assert.deepEqual(
            await service.completeEnrollment({
                flowId: 'flow-1',
                invitationToken: 'invitation-token',
                password: 'Recipe42?',
                credential: registrationResponse()
            }),
            { userId: 42, status: 'active', mfaEnrolled: true }
        );

        assert.deepEqual(calls.registrationVerification, {
            response: registrationResponse(),
            expectedChallenge: 'registration-challenge',
            expectedOrigin: 'https://staff.example.com',
            expectedRPID: 'staff.example.com',
            requireUserVerification: true
        });
        assert.equal(repository.enrollmentInput?.passwordHash, 'password-hash:Recipe42?');
        assert.equal(repository.enrollmentInput?.credential.credentialId, 'credential-1');
        assert.deepEqual(repository.enrollmentInput?.credential.transports, ['usb']);
    });

    it('does not persist enrollment for weak passwords, expired flows, or invalid WebAuthn responses', async () => {
        const repository = new FakeStaffMfaRepository();
        const service = createService(repository);

        await assert.rejects(
            () =>
                service.completeEnrollment({
                    flowId: 'flow-1',
                    invitationToken: 'token',
                    password: 'short',
                    credential: registrationResponse()
                }),
            (error) => assertHttpError(error, 'AUTH_WEAK_PASSWORD', 400)
        );
        await assert.rejects(
            () =>
                service.completeEnrollment({
                    flowId: 'flow-1',
                    invitationToken: 'token',
                    password: 'Recipe42?',
                    credential: registrationResponse()
                }),
            (error) => assertHttpError(error, 'STAFF_MFA_ENROLLMENT_INVALID', 400)
        );

        repository.registrationChallenge = {
            id: 'flow-1',
            staffUserId: 42,
            invitationId: 7,
            sessionVersion: 1,
            challenge: 'registration-challenge',
            expiresAt: new Date('2026-07-16T12:02:00.000Z')
        };
        const calls = { registrationFailure: true };
        const invalidResponseService = createService(repository, calls);
        await assert.rejects(
            () =>
                invalidResponseService.completeEnrollment({
                    flowId: 'flow-1',
                    invitationToken: 'token',
                    password: 'Recipe42?',
                    credential: registrationResponse()
                }),
            (error) => assertHttpError(error, 'STAFF_MFA_REGISTRATION_FAILED', 400)
        );
        assert.equal(repository.enrollmentInput, null);
    });
});

describe('StaffMfaService WebAuthn authentication', () => {
    it('requires an enrolled credential before issuing authentication options', async () => {
        const repository = new FakeStaffMfaRepository();
        const service = createService(repository);

        await assert.rejects(() => service.beginAuthentication(42, 3), (error) => assertHttpError(error, 'STAFF_MFA_REQUIRED', 401));
        assert.equal(repository.savedChallenge, null);
    });

    it('creates user-verified authentication options restricted to the staff credentials', async () => {
        const repository = new FakeStaffMfaRepository();
        repository.credentials = [passkey];
        const calls: Record<string, unknown> = {};
        const service = createService(repository, calls);

        await service.beginAuthentication(42, 3);

        assert.deepEqual(calls.authenticationOptions, {
            rpID: 'staff.example.com',
            timeout: 120_000,
            userVerification: 'required',
            allowCredentials: [{ id: 'credential-1', transports: ['usb'] }]
        });
        assert.equal(repository.savedChallenge?.purpose, 'authentication');
        assert.equal(repository.savedChallenge?.invitationId, null);
        assert.equal(repository.savedChallenge?.expectedSessionVersion, 3);
    });

    it('verifies origin, RP, challenge and credential before atomically consuming the flow', async () => {
        const repository = new FakeStaffMfaRepository();
        repository.credentials = [passkey];
        repository.authenticationChallenge = {
            id: 'flow-1',
            staffUserId: 42,
            invitationId: null,
            sessionVersion: 3,
            challenge: 'authentication-challenge',
            expiresAt: new Date('2026-07-16T12:02:00.000Z')
        };
        const calls: Record<string, unknown> = {};
        const service = createService(repository, calls);

        assert.deepEqual(await service.completeAuthentication('flow-1', authenticationResponse()), {
            staffUserId: 42,
            sessionVersion: 3,
            credentialId: 'credential-1',
            verifiedAt: now
        });
        assert.deepEqual(repository.authenticationInput, {
            challengeId: 'flow-1',
            staffUserId: 42,
            credentialId: 'credential-1',
            expectedCounter: 4,
            newCounter: 5
        });
        assert.deepEqual(calls.authenticationVerification, {
            response: authenticationResponse(),
            expectedChallenge: 'authentication-challenge',
            expectedOrigin: 'https://staff.example.com',
            expectedRPID: 'staff.example.com',
            requireUserVerification: true,
            credential: {
                id: 'credential-1',
                publicKey: passkey.publicKey,
                counter: 4,
                transports: ['usb']
            }
        });
    });

    it('rejects expired, unknown, cross-user, and replayed assertions without a staff session', async () => {
        const repository = new FakeStaffMfaRepository();
        const service = createService(repository);

        await assert.rejects(() => service.completeAuthentication('flow-1', authenticationResponse()), (error) => assertHttpError(error, 'AUTH_INVALID_MFA_ASSERTION', 401));

        repository.authenticationChallenge = {
            id: 'flow-1',
            staffUserId: 42,
            invitationId: null,
            sessionVersion: 3,
            challenge: 'authentication-challenge',
            expiresAt: new Date('2026-07-16T12:02:00.000Z')
        };
        await assert.rejects(() => service.completeAuthentication('flow-1', authenticationResponse('wrong-user-handle')), (error) => assertHttpError(error, 'AUTH_INVALID_MFA_ASSERTION', 401));

        repository.credentials = [passkey];
        const invalidCalls = { authenticationFailure: true };
        const invalidAssertionService = createService(repository, invalidCalls);
        await assert.rejects(() => invalidAssertionService.completeAuthentication('flow-1', authenticationResponse()), (error) => assertHttpError(error, 'AUTH_INVALID_MFA_ASSERTION', 401));

        repository.authenticationCompleted = false;
        await assert.rejects(() => service.completeAuthentication('flow-1', authenticationResponse()), (error) => assertHttpError(error, 'AUTH_INVALID_MFA_ASSERTION', 401));
    });
});
