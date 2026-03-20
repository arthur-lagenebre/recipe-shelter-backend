import type { RequestHandler } from 'express';
import { parseLoginBody, parseRegisterBody } from './auth.dto.js';
import { authService } from '../../services/auth/auth.service.js';

import type { Handler } from './http.types.js';
import type { PasswordResetService } from '../../services/auth/password-reset.service.js';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const input = parseRegisterBody(req.body);
    const result = await authService.register(input);

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const input = parseLoginBody(req.body);
    const result = await authService.login(input);

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const me: RequestHandler = (req, res) => {
  if (!req.auth) {
    return res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });
  }

  return res.status(200).json({ auth: req.auth });
};

export const makeForgotPasswordHandler = (service: PasswordResetService): Handler => {
  return async (req, res, next) => {
    try {
      const mail = typeof req.body?.mail === 'string' ? req.body.mail : '';

      if (!mail.trim()) {
        res.status(400).json({ error: { message: 'Email is required', code: 'AUTH_FORGOT_PASSWORD_INVALID_EMAIL' } });

        return;
      }

      await service.requestReset(mail);

      res.status(200).json({ ok: true, message: 'If an account exists for this email, a password reset link has been sent.' });

      return;
    } catch (err) {
      next(err);
      return;
    }
  };
};

export const makeResetPasswordHandler = (
  service: PasswordResetService
): Handler => {
  return async (req, res, next) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!token.trim()) {
        res.status(400).json({ error: { message: 'Token is required', code: 'AUTH_RESET_PASSWORD_MISSING_TOKEN' } });

        return;
      }

      await service.resetPassword(token, password);

      res.status(200).json({ ok: true, message: 'Password has been reset successfully.' });

      return;
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
      
      return;
    }
  };
};

export const authController = { register, login, me, makeForgotPasswordHandler, makeResetPasswordHandler };