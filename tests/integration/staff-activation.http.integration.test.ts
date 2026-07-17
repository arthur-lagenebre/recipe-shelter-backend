import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../../src/app.js';
import { badRequest } from '../../src/utils/errors.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { AuthService } from '../../src/services/auth/auth.service.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const credential = {
  id: 'credential-1',
  rawId: 'credential-1',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'client-data',
    attestationObject: 'attestation'
  }
};

describe('POST /api/v1/staff/invitations/:token/activate', () => {
  let server: HttpTestServer;
  const calls: unknown[] = [];
  const consumedFlows = new Set<string>();

  before(async () => {
    const authService = {
      async activateStaffInvitation(input: { flowId: string }) {
        if (consumedFlows.has(input.flowId))
          throw badRequest('Invalid or expired MFA enrollment flow', 'STAFF_MFA_ENROLLMENT_INVALID');

        consumedFlows.add(input.flowId);
        calls.push(input);

        return { userId: 42, status: 'active', mfaEnrolled: true };
      }
    } as unknown as AuthService;

    server = await startHttpTestServer(createApp({ authService }));
  });

  after(async () => server.close());

  it('uses the invitation as bearer authentication and activates only once after MFA verification', async () => {
    const request = () => fetch(`${server.baseUrl}/api/v1/staff/invitations/raw-token/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flowId: 'flow-1', password: 'Recipe42?', credential })
    });
    const response = await request();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: 42, status: 'active', mfaEnrolled: true });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(calls, [{
      flowId: 'flow-1',
      invitationToken: 'raw-token',
      password: 'Recipe42?',
      credential
    }]);

    const replay = await request();
    assert.equal(replay.status, 400);
    assert.deepEqual(await replay.json(), {
      error: {
        message: 'Invalid or expired MFA enrollment flow',
        code: 'STAFF_MFA_ENROLLMENT_INVALID'
      }
    });
  });

  it('rejects malformed WebAuthn activation payloads before invoking the service', async () => {
    const response = await fetch(`${server.baseUrl}/api/v1/staff/invitations/raw-token-2/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flowId: 'flow-2', password: 'Recipe42?', credential: {} })
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'AUTH_INVALID_WEBAUTHN_RESPONSE');
    assert.equal(calls.length, 1);
  });
});
