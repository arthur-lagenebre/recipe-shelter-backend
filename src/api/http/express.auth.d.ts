import type { AuthContext } from '../../auth/auth.types';

declare global {
    namespace Express {
        interface Request {
            auth?: AuthContext;
        }
    }
}

export { };