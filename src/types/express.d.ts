import 'express';

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: number;
                username: string;
                roleId: number;
            };
        }
    }
}

export { };