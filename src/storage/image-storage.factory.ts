import { LocalImageStorage } from './local-image.storage.js';
import { S3ImageStorage } from './s3-image.storage.js';

import type { ImageStorage } from './image-storage.interface.js';

export type ImageStorageConfig = {
    driver: 'local' | 's3';
    publicBaseUrl: string;
    localRoot: string;
    s3: {
        endpoint: string;
        region: string;
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
    };
};

export function createImageStorage(config: ImageStorageConfig): ImageStorage {
    if (config.driver === 'local')
        return new LocalImageStorage(config.localRoot, config.publicBaseUrl);

    if (config.driver === 's3') {
        return new S3ImageStorage({
            ...config.s3,
            publicBaseUrl: config.publicBaseUrl
        });
    }

    throw new Error(`Unknown image storage driver: ${String(config.driver)}`);
}
