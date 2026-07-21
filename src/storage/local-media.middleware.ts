import express from 'express';

import { LocalImageStorage } from './local-image.storage.js';

import type { ImageStorage } from './image-storage.interface.js';
import type { RequestHandler } from 'express';

export function createLocalMediaMiddleware(storage: ImageStorage): RequestHandler | null {
    if (!(storage instanceof LocalImageStorage))
        return null;

    return express.static(storage.rootPath, { dotfiles: 'deny', index: false });
}
