import type { RequestHandler } from 'express';
import { parseLoginBody, parseRegisterBody } from './auth.dto.js';
import { authService } from '../../services/auth/auth.service.js';

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
    return res.status(401).json({
      error: {
        message: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED'
      }
    });
  }

  return res.status(200).json({ auth: req.auth });
};

export const authController = { register, login, me };