import type { RequestHandler } from 'express';
import { authService } from '../../services/auth/auth.service.js';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { mail, username, password } = req.body as {
      mail?: string;
      username?: string;
      password?: string;
    };

    const result = await authService.register({
      mail: mail ?? '',
      username: username ?? '',
      password: password ?? '',
    });

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { mail, password } = req.body as {
      mail?: string;
      password?: string;
    };

    const result = await authService.login({
      mail: mail ?? '',
      password: password ?? '',
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const authController = { register, login };