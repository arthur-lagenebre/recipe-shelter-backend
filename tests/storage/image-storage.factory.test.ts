import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createImageStorage } from '../../src/storage/image-storage.factory.js';
import { LocalImageStorage } from '../../src/storage/local-image.storage.js';
import { S3ImageStorage } from '../../src/storage/s3-image.storage.js';

const config = {
    publicBaseUrl: 'https://images.example.test',
    localRoot: './var/test-uploads',
    s3: {
        endpoint: 'https://private.example.test',
        region: 'auto',
        bucket: 'bucket',
        accessKeyId: 'id',
        secretAccessKey: 'secret'
    }
};

describe('createImageStorage', () => {
    it('creates the configured local or S3 storage backend', () => {
        const local = createImageStorage({ ...config, driver: 'local' });
        const s3 = createImageStorage({ ...config, driver: 's3' });

        assert.ok(local instanceof LocalImageStorage);
        assert.ok(s3 instanceof S3ImageStorage);
        assert.equal(s3.getPublicUrl('recipes/1/image.webp'), 'https://images.example.test/recipes/1/image.webp');
    });

    it('rejects an unsupported storage backend at the factory boundary', () => {
        assert.throws(
            () => createImageStorage({ ...config, driver: 'unsupported' as never }),
            /Unknown image storage driver: unsupported/
        );
    });
});
