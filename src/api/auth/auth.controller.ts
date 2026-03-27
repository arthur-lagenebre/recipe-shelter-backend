import { parseLoginBody, parseRegisterBody } from './auth.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AuthService } from '../../services/auth/auth.service.js';
import type { PasswordResetService } from '../../services/auth/password-reset.service.js';
import type { Handler } from '../http/http.types.js';

export function createAuthController(authService: AuthService, passwordResetService: PasswordResetService) {
  const register = asyncHandler(async (req, res) => {
    const input = parseRegisterBody(req.body);
    const result = await authService.register(input);

    res.status(201).json(result);
  });

  const login = asyncHandler(async (req, res) => {
    const input = parseLoginBody(req.body);
    const result = await authService.login(input);

    res.status(200).json(result);
  });

  const me: Handler = (req, res) => {
    if (!req.auth) {
      res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

      return;
    }

    res.status(200).json({ auth: req.auth });
  };

  const forgotPassword: Handler = asyncHandler(async (req, res) => {
    const mail = typeof req.body?.mail === 'string' ? req.body.mail : '';

    if (!mail.trim()) {
      res.status(400).json({
        error: {
          message: 'Email is required',
          code: 'AUTH_FORGOT_PASSWORD_INVALID_EMAIL'
        }
      });

      return;
    }

    await passwordResetService.requestReset(mail);

    res.status(200).json({ ok: true, message: 'If an account exists for this email, a password reset link has been sent.' });
  });

  const resetPassword: Handler = asyncHandler(async (req, res, next) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!token.trim()) {
      res.status(400).json({
        error: {
          message: 'Token is required',
          code: 'AUTH_RESET_PASSWORD_MISSING_TOKEN'
        }
      });

      return;
    }

    try {
      await passwordResetService.resetPassword(token, password);

      res.status(200).json({
        ok: true,
        message: 'Password has been reset successfully.'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password reset failed';

      if (message === 'Invalid or expired reset token') {
        res.status(400).json({ error: { message, code: 'AUTH_RESET_PASSWORD_BAD_TOKEN' } });

        return;
      }

      if (message === 'Password is required' || message === 'Password must be at least 8 characters' || message === 'Password must be at most 128 characters') {
        res.status(400).json({ error: { message, code: 'AUTH_RESET_PASSWORD_BAD_PASSWORD' } });

        return;
      }

      next(err);
    }
  });

  return { register, login, me, forgotPassword, resetPassword };
}
