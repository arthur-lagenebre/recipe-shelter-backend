import type { Request, Response, NextFunction } from 'express';

export type Handler<T = void> = (req: Request, res: Response, next: NextFunction) => T | Promise<T>;
