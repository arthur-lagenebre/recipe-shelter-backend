import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

function importEnv(overrides: NodeJS.ProcessEnv) {
    const envModule = new URL('../../src/utils/env.ts', import.meta.url).href;
    return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `await import(${JSON.stringify(envModule)})`], {
        encoding: 'utf8',
        env: {
            ...process.env,
            JWT_SECRET: process.env.JWT_SECRET ?? 'test-only-secret',
            ...overrides
        }
    });
}

describe('auth session environment configuration', () => {
    it('rejects identical app and admin cookie names or audiences', () => {
        const sameCookie = importEnv({
            AUTH_APP_SESSION_COOKIE_NAME: 'same_session',
            AUTH_ADMIN_SESSION_COOKIE_NAME: 'same_session'
        });
        assert.notEqual(sameCookie.status, 0);
        assert.match(sameCookie.stderr, /cookie names must be different/);

        const sameAudience = importEnv({
            AUTH_APP_JWT_AUDIENCE: 'same-audience',
            AUTH_ADMIN_JWT_AUDIENCE: 'same-audience'
        });
        assert.notEqual(sameAudience.status, 0);
        assert.match(sameAudience.stderr, /audiences must be different/);
    });

    it('rejects an admin JWT or cookie lifetime that is not shorter than the app lifetime', () => {
        const jwtLifetime = importEnv({
            AUTH_APP_JWT_EXPIRES_IN: '8h',
            AUTH_ADMIN_JWT_EXPIRES_IN: '8h'
        });
        assert.notEqual(jwtLifetime.status, 0);
        assert.match(jwtLifetime.stderr, /Admin JWT lifetime must be shorter/);

        const cookieLifetime = importEnv({
            AUTH_APP_SESSION_COOKIE_MAX_AGE_MS: '1000',
            AUTH_ADMIN_SESSION_COOKIE_MAX_AGE_MS: '1000'
        });
        assert.notEqual(cookieLifetime.status, 0);
        assert.match(cookieLifetime.stderr, /Admin session cookie lifetime must be shorter/);
    });

    it('requires a secure and origin-compatible WebAuthn relying party configuration', () => {
        const insecureOrigin = importEnv({
            AUTH_STAFF_WEBAUTHN_ORIGIN: 'http://staff.example.com',
            AUTH_STAFF_WEBAUTHN_RP_ID: 'example.com'
        });
        assert.notEqual(insecureOrigin.status, 0);
        assert.match(insecureOrigin.stderr, /must use HTTPS/);

        const unrelatedRpId = importEnv({
            AUTH_STAFF_WEBAUTHN_ORIGIN: 'https://staff.example.com',
            AUTH_STAFF_WEBAUTHN_RP_ID: 'attacker.example'
        });
        assert.notEqual(unrelatedRpId.status, 0);
        assert.match(unrelatedRpId.stderr, /must match the origin hostname/);

        const parentRpId = importEnv({
            AUTH_STAFF_WEBAUTHN_ORIGIN: 'https://staff.example.com',
            AUTH_STAFF_WEBAUTHN_RP_ID: 'example.com'
        });
        assert.equal(parentRpId.status, 0, parentRpId.stderr);
    });

    it('rejects a staff reauthentication window longer than ten minutes', () => {
        const excessiveWindow = importEnv({
            AUTH_STAFF_REAUTHENTICATION_MAX_AGE_MS: '600001'
        });

        assert.notEqual(excessiveWindow.status, 0);
        assert.match(excessiveWindow.stderr, /AUTH_STAFF_REAUTHENTICATION_MAX_AGE_MS must be a positive integer of at most 600000/);
    });
});
