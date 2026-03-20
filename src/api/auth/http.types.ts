import type { Request, Response, NextFunction } from 'express';

export type Handler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;