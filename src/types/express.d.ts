import type { AuthContext } from '../api/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: Readonly<AuthContext>;
    }
  }
}