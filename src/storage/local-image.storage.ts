import { constants } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildImagePublicUrl, normalizeImageStorageKey } from './image-storage-key.js';

import type { ImageStorage, PutImageInput } from './image-storage.interface.js';

export class LocalImageStorage implements ImageStorage {
    readonly rootPath: string;

    constructor(rootPath: string, private readonly publicBaseUrl: string) {
        this.rootPath = path.resolve(rootPath);
    }

    async put(input: PutImageInput): Promise<void> {
        const filePath = this.resolveKey(input.key);

        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, input.body, { flag: 'w' });
    }

    async delete(key: string): Promise<void> {
        try {
            await unlink(this.resolveKey(key));
        } catch (error) {
            if (!isNodeError(error) || error.code !== 'ENOENT')
                throw error;
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            await access(this.resolveKey(key), constants.F_OK);
            return true;
        } catch (error) {
            if (isNodeError(error) && error.code === 'ENOENT')
                return false;

            throw error;
        }
    }

    getPublicUrl(key: string): string {
        return buildImagePublicUrl(this.publicBaseUrl, key);
    }

    private resolveKey(value: string): string {
        const key = normalizeImageStorageKey(value);
        const candidate = path.resolve(this.rootPath, ...key.split('/'));
        const relative = path.relative(this.rootPath, candidate);

        if (relative.startsWith('..') || path.isAbsolute(relative))
            throw new Error('Image storage key escapes the configured root');

        return candidate;
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}
