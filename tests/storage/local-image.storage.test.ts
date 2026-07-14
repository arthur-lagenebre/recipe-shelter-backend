import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import express from 'express';

import { LocalImageStorage } from '../../src/storage/local-image.storage.js';
import { createLocalMediaMiddleware } from '../../src/storage/local-media.middleware.js';
import { startHttpTestServer } from '../helpers/http-test-server.js';

describe('LocalImageStorage', () => {
    let root: string;
    let storage: LocalImageStorage;

    beforeEach(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), 'recipe-shelter-images-'));
        storage = new LocalImageStorage(root, 'http://localhost:3000/media/');
    });

    afterEach(async () => {
        const resolvedRoot = path.resolve(root);
        assert.ok(resolvedRoot.startsWith(path.resolve(os.tmpdir())));
        await rm(resolvedRoot, { recursive: true, force: true });
    });

    it('creates nested directories, writes, checks and deletes files', async () => {
        const key = 'recipes/42/image-id/large.webp';
        const body = Buffer.from('webp fixture');

        await storage.put({ key, body, contentType: 'image/webp' });

        assert.equal(await storage.exists(key), true);
        assert.deepEqual(await readFile(path.join(root, ...key.split('/'))), body);
        assert.equal(storage.getPublicUrl(key), 'http://localhost:3000/media/recipes/42/image-id/large.webp');

        await storage.delete(key);
        assert.equal(await storage.exists(key), false);
        await storage.delete(key);
    });

    it('serves only files below the configured media root', async () => {
        const key = 'recipes/42/image-id/thumbnail.webp';
        const body = Buffer.from('public fixture');
        await storage.put({ key, body, contentType: 'image/webp' });

        const app = express();
        const media = createLocalMediaMiddleware(storage);
        assert.ok(media);
        app.use('/media', media);
        const server = await startHttpTestServer(app);

        try {
            const response = await fetch(`${server.baseUrl}/media/${key}`);
            assert.equal(response.status, 200);
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);

            const escaped = await fetch(`${server.baseUrl}/media/%2e%2e/package.json`);
            assert.equal(escaped.status, 404);
        } finally {
            await server.close();
        }
    });

    it('rejects absolute paths, traversal, backslashes and malformed keys', async () => {
        for (const key of ['../secret.webp', '/absolute.webp', 'recipes\\secret.webp', 'recipes//secret.webp', 'recipes/./secret.webp']) {
            await assert.rejects(
                () => storage.put({ key, body: Buffer.from('x'), contentType: 'image/webp' }),
                /Invalid image storage key|escapes/
            );
        }
    });
});
