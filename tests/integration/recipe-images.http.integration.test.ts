import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import sharp from 'sharp';

import { createRecipesController } from '../../src/api/recipes/recipes.controller.js';
import { createRecipesRouter } from '../../src/api/recipes/recipes.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { notFound } from '../../src/middlewares/not-found.js';
import { configureAuthSessionRepository, configureAuthUserRepository } from '../../src/middlewares/require-auth.js';
import { MAX_RECIPE_IMAGE_BYTES, RecipeImageProcessor } from '../../src/services/recipes/recipe-image.processor.js';
import { normalizeAltText } from '../../src/services/recipes/recipe-image.service.js';
import { badRequest } from '../../src/utils/errors.js';
import { TestSessionRepository } from '../helpers/auth-session.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

import type { User } from '../../src/repositories/users/user.types.js';
import type { HttpTestServer } from '../helpers/http-test-server.js';

const activeUser: User = {
    id: 2,
    mail: 'owner@example.test',
    username: 'owner',
    accountType: 'community',
    status: 'active',
    emailValidatedAt: new Date(),
    bannedByUserId: null,
    bannedReason: null,
    bannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
};

const processor = new RecipeImageProcessor();

const imageService = {
    async replace(_recipeId: number, _auth: unknown, upload: { buffer: Buffer } | undefined, altText: unknown) {
        if (!upload)
            throw badRequest('An image file is required', 'IMAGE_REQUIRED');

        const normalizedAltText = normalizeAltText(altText);
        const result = await processor.process(upload.buffer);

        return {
            id: 'fixture-id',
            largeUrl: 'https://images.example.test/large.webp',
            mediumUrl: 'https://images.example.test/medium.webp',
            thumbnailUrl: 'https://images.example.test/thumbnail.webp',
            width: result.large.width,
            height: result.large.height,
            altText: normalizedAltText
        };
    },
    async delete() {}
};

let sessionCookie = '';

function authenticatedHeaders(): HeadersInit {
    return { cookie: sessionCookie };
}

function formWithFile(buffer: Buffer, filename: string, contentType: string, altText?: string): FormData {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(buffer)], { type: contentType }), filename);
    if (altText !== undefined)
        form.append('altText', altText);
    return form;
}

async function jpegFixture(): Promise<Buffer> {
    return sharp({ create: { width: 80, height: 40, channels: 3, background: 'orange' } })
        .jpeg()
        .toBuffer();
}

async function errorCode(response: Response): Promise<string> {
    const payload = (await response.json()) as { error: { code: string } };
    return payload.error.code;
}

describe('recipe image multipart HTTP integration', () => {
    let server: HttpTestServer;

    before(async () => {
        configureAuthUserRepository({ findById: async () => activeUser });
        const sessions = new TestSessionRepository();
        configureAuthSessionRepository(sessions);
        sessionCookie = await sessions.issueCookie(activeUser, 'app');

        const app = express();
        app.use(cookieParser());
        app.use('/api/v1/recipes', createRecipesRouter(createRecipesController({} as never, imageService as never)));
        app.use(notFound);
        app.use(errorHandler);
        server = await startHttpTestServer(app);
    });

    after(async () => {
        await server.close();
    });

    it('rejects unauthenticated uploads before accepting multipart content', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, { method: 'PUT' });

        assert.equal(response.status, 401);
        assert.equal(await errorCode(response), 'AUTH_NO_TOKEN');
    });

    it('requires exactly one file and enforces the 10 MB limit', async () => {
        const missing = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: new FormData()
        });
        assert.equal(missing.status, 400);
        assert.equal(await errorCode(missing), 'IMAGE_REQUIRED');

        const tooLarge = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: formWithFile(Buffer.alloc(MAX_RECIPE_IMAGE_BYTES + 1), 'large.jpg', 'image/jpeg')
        });
        assert.equal(tooLarge.status, 400);
        assert.equal(await errorCode(tooLarge), 'IMAGE_TOO_LARGE');

        const multipleForm = formWithFile(await jpegFixture(), 'one.jpg', 'image/jpeg');
        multipleForm.append('image', new Blob([new Uint8Array(await jpegFixture())], { type: 'image/jpeg' }), 'two.jpg');
        const multiple = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: multipleForm
        });
        assert.equal(multiple.status, 400);
        assert.equal(await errorCode(multiple), 'IMAGE_INVALID');
    });

    it('trusts decoded content rather than filename extension or client content type', async () => {
        const response = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: formWithFile(await jpegFixture(), 'misleading.pdf', 'application/pdf', '  Photo du plat  ')
        });

        assert.equal(response.status, 200);
        const body = (await response.json()) as { altText: string; width: number; height: number };
        assert.equal(body.altText, 'Photo du plat');
        assert.deepEqual([body.width, body.height], [80, 40]);
    });

    it('returns structured errors for invalid content, forbidden formats and excessive alt text', async () => {
        const invalid = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: formWithFile(Buffer.from('not an image'), 'fake.jpg', 'image/jpeg')
        });
        assert.equal(invalid.status, 400);
        assert.equal(await errorCode(invalid), 'IMAGE_INVALID');

        const forbidden = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: formWithFile(Buffer.from('GIF89a forbidden'), 'animation.gif', 'image/gif')
        });
        assert.equal(forbidden.status, 400);
        assert.equal(await errorCode(forbidden), 'IMAGE_FORMAT_NOT_SUPPORTED');

        const altText = await fetch(`${server.baseUrl}/api/v1/recipes/10/cover-image`, {
            method: 'PUT',
            headers: authenticatedHeaders(),
            body: formWithFile(await jpegFixture(), 'valid.jpg', 'image/jpeg', 'x'.repeat(256))
        });
        assert.equal(altText.status, 400);
        assert.equal(await errorCode(altText), 'IMAGE_ALT_TEXT_TOO_LONG');
    });
});
