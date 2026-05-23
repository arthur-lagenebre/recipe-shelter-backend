import { parseLoginBody, parseRegisterBody, parseResendValidationEmailBody, parseResetPasswordBody, parseValidateEmailBody } from './auth.dto.js';
import { clearSessionCookie, setSessionCookie } from '../../utils/session-cookie.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AuthService } from '../../services/auth/auth.service.js';
import type { EmailValidationService } from '../../services/auth/email-validation.service.js';
import type { PasswordResetService } from '../../services/auth/password-reset.service.js';
import type { Handler } from '../http/http.types.js';

export function createAuthController(authService: AuthService, passwordResetService: PasswordResetService, emailValidationService: EmailValidationService) {
  const register = asyncHandler(async (req, res) => {
    const input = parseRegisterBody(req.body);
    const result = await authService.register(input);

    res.status(201).json(result);
  });

  const login = asyncHandler(async (req, res) => {
    const input = parseLoginBody(req.body);
    const { token, user } = await authService.login(input);

    setSessionCookie(res, token);

    res.status(200).json({ user });
  });

  const me: Handler = (req, res) => {
    if (!req.auth) {
      res.status(401).json({ error: { message: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' } });

      return;
    }

    res.status(200).json({ auth: req.auth });
  };

  const logout: Handler = (_req, res) => {
    clearSessionCookie(res);

    res.status(200).json({ ok: true });
  };

  const forgotPassword: Handler = asyncHandler(async (req, res) => {
    const mail = typeof req.body?.mail === 'string' ? req.body.mail : '';

    if (!mail.trim()) {
      res.status(400).json({ error: { message: 'Email is required', code: 'AUTH_FORGOT_PASSWORD_INVALID_EMAIL' } });

      return;
    }

    await passwordResetService.requestReset(mail);

    res.status(200).json({ ok: true, message: 'If an account exists for this email, a password reset link has been sent.' });
  });

  const resetPassword: Handler = asyncHandler(async (req, res, next) => {
    const input = parseResetPasswordBody(req.body);

    try {
      await passwordResetService.resetPassword(input.token, input.password);

      res.status(200).json({ ok: true, message: 'Password has been reset successfully.' });
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

  const validateEmail: Handler = asyncHandler(async (req, res) => {
    const input = parseValidateEmailBody(req.body);
    const user = await emailValidationService.validateEmail(input.token);

    res.status(200).json({ ok: true, message: 'Email has been validated successfully.', user });
  });

  const resendValidationEmail: Handler = asyncHandler(async (req, res) => {
    const input = parseResendValidationEmailBody(req.body);

    await emailValidationService.resendValidationEmail(input.mail);

    res.status(200).json({ ok: true, message: 'If an inactive account exists for this email, a validation link has been sent.' });
  });

  return { register, login, me, logout, forgotPassword, resetPassword, validateEmail, resendValidationEmail };
}
