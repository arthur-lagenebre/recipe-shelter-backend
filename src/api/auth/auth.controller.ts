import type { Handler } from '../http/http.types.js';
import type { AuthService } from '../../services/auth/auth.service.js';
import { parseLoginBody, parseRegisterBody } from './auth.dto.js';

export class AuthController {
  constructor(private readonly auth: AuthService) { }

  register: Handler = async (request, result, next) => {
    try {
      const dto = parseRegisterBody(request.body);
      const out = await this.auth.register(dto);

      result.status(201).json(out);
    } catch (e) {
      next(e);
    }
  };

  login: Handler = async (request, result, next) => {
    try {
      const dto = parseLoginBody(request.body);
      const out = await this.auth.login(dto);

      result.status(200).json(out);
    } catch (e) {
      next(e);
    }
  };
}