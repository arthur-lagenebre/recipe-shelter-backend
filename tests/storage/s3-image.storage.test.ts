import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { S3ImageStorage } from '../../src/storage/s3-image.storage.js';

const config = {
    endpoint: 'https://private.example.test',
    region: 'auto',
    bucket: 'bucket',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    publicBaseUrl: 'https://images.example.test'
};

describe('S3ImageStorage', () => {
    it('encapsulates S3 commands and builds public URLs independently from the endpoint', async () => {
        const commands: Array<{ constructor: { name: string }; input: Record<string, unknown> }> = [];
        const client = {
            async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
                commands.push(command);
                return {};
            }
        };
        const storage = new S3ImageStorage({
            endpoint: 'https://private-account.r2.cloudflarestorage.com',
            region: 'auto',
            bucket: 'recipe-shelter',
            accessKeyId: 'secret-id',
            secretAccessKey: 'secret-key',
            publicBaseUrl: 'https://images.example.test'
        }, client as never);

        const key = 'recipes/10/image-id/large.webp';
        await storage.put({ key, body: Buffer.from('webp'), contentType: 'image/webp' });
        assert.equal(await storage.exists(key), true);
        await storage.delete(key);

        assert.deepEqual(commands.map((command) => command.constructor.name), ['PutObjectCommand', 'HeadObjectCommand', 'DeleteObjectCommand']);
        assert.deepEqual(commands[0]?.input, {
            Bucket: 'recipe-shelter',
            Key: key,
            Body: Buffer.from('webp'),
            ContentType: 'image/webp'
        });
        assert.equal(storage.getPublicUrl(key), `https://images.example.test/${key}`);
        assert.equal(storage.getPublicUrl(key).includes('r2.cloudflarestorage.com'), false);
    });

    it('maps a missing object to false', async () => {
        const client = {
            async send() {
                throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } };
            }
        };
        const storage = new S3ImageStorage(config, client as never);

        assert.equal(await storage.exists('recipes/10/image-id/large.webp'), false);
    });

    it('recognizes every supported S3 not-found response shape', async () => {
        for (const error of [
            { name: 'NoSuchKey' },
            { name: 'UnknownError', $metadata: { httpStatusCode: 404 } }
        ]) {
            const client = {
                async send() {
                    throw error;
                }
            };
            const storage = new S3ImageStorage(config, client as never);

            assert.equal(await storage.exists('recipes/10/image-id/large.webp'), false);
        }
    });

    it('preserves unexpected S3 failures', async () => {
        for (const error of [null, new Error('S3 unavailable')]) {
            const client = {
                async send() {
                    throw error;
                }
            };
            const storage = new S3ImageStorage(config, client as never);

            await assert.rejects(
                () => storage.exists('recipes/10/image-id/large.webp'),
                (caught) => caught === error
            );
        }
    });
});
