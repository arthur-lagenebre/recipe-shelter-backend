import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { buildImagePublicUrl, normalizeImageStorageKey } from './image-storage-key.js';

import type { ImageStorage, PutImageInput } from './image-storage.interface.js';

export type S3ImageStorageConfig = {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl: string;
};

export class S3ImageStorage implements ImageStorage {
    private readonly client: S3Client;

    constructor(
        private readonly config: S3ImageStorageConfig,
        client?: S3Client
    ) {
        this.client =
            client ??
            new S3Client({
                endpoint: config.endpoint,
                region: config.region,
                credentials: {
                    accessKeyId: config.accessKeyId,
                    secretAccessKey: config.secretAccessKey
                },
                forcePathStyle: true
            });
    }

    async put(input: PutImageInput): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: normalizeImageStorageKey(input.key),
                Body: input.body,
                ContentType: input.contentType
            })
        );
    }

    async delete(key: string): Promise<void> {
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: normalizeImageStorageKey(key)
            })
        );
    }

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(
                new HeadObjectCommand({
                    Bucket: this.config.bucket,
                    Key: normalizeImageStorageKey(key)
                })
            );
            return true;
        } catch (error) {
            if (isNotFound(error))
                return false;

            throw error;
        }
    }

    getPublicUrl(key: string): string {
        return buildImagePublicUrl(this.config.publicBaseUrl, key);
    }
}

function isNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object')
        return false;

    const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };

    return value.name === 'NotFound' || value.name === 'NoSuchKey' || value.$metadata?.httpStatusCode === 404;
}
