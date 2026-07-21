import { posix } from 'node:path';

const SAFE_STORAGE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

export function normalizeImageStorageKey(value: string): string {
    const key = value.trim();

    if (!key || key.startsWith('/') || key.includes('\\') || !SAFE_STORAGE_KEY.test(key))
        throw new Error('Invalid image storage key');

    const segments = key.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..'))
        throw new Error('Invalid image storage key');

    if (posix.normalize(key) !== key)
        throw new Error('Invalid image storage key');

    return key;
}

export function buildImagePublicUrl(baseUrl: string, storageKey: string): string {
    const key = normalizeImageStorageKey(storageKey);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');

    return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
}
