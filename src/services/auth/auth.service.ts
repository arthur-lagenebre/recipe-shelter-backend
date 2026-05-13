import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { validatePassword } from './password-policy.js';
import { env } from '../../utils/env.js';
import { conflict, unauthorized, badRequest } from '../../utils/errors.js';
import { normalizeEmail } from '../../utils/string.js';

import type { EmailValidationService } from './email-validation.service.js';
import type { UserRepository } from '../../repositories/users/user.repository.interface.js';
import type { User } from '../../repositories/users/user.types.js';
import type { Secret, SignOptions } from 'jsonwebtoken';

export type AuthTokenPayload = {
  sub: number;
  username: string;
  roleId: number;
};

export class AuthService {
  constructor(private readonly users: UserRepository, private readonly emailValidationService: EmailValidationService) { }

  private signToken(user: User): string {
    const payload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      roleId: user.roleId
    };
    const secret: Secret = env.auth.jwtSecret;
    const options: SignOptions = {
      expiresIn: env.auth.jwtExpiresIn as SignOptions['expiresIn']
    };

    return jwt.sign(payload, secret, options);
  }

  async register(input: { mail: string; username: string; password: string }): Promise<{ user: User; message: string }> {
    const mail = normalizeEmail(input.mail);
    const username = input.username.trim();
    const password = input.password;

    if (!mail || !username || !password)
      throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

    const passwordError = validatePassword(password);
    if (passwordError)
      throw badRequest(passwordError, 'AUTH_WEAK_PASSWORD');

    if (await this.users.isEmailTaken(mail))
      throw conflict('Email already used', 'AUTH_EMAIL_TAKEN');

    if (username.length < 3)
      throw badRequest('Username too short', 'AUTH_WEAK_USERNAME');
    if (await this.users.isUsernameTaken(username))
      throw conflict('Username already used', 'AUTH_USERNAME_TAKEN');

    const roleId = await this.users.getRoleIdByName(env.auth.defaultRoleName);
    if (!roleId)
      throw badRequest(`Default role not found: ${env.auth.defaultRoleName}`, 'AUTH_ROLE_NOT_FOUND');

    const passwordHash = await bcrypt.hash(password, env.auth.bcryptCost);
    const user = await this.users.create({ mail, username, passwordHash, roleId, status: 'inactive' });
    await this.emailValidationService.sendValidationEmailForUser(user);

    return { user, message: 'Account created. Please validate your email before signing in.' };
  }

  async login(input: { mail: string; password: string }): Promise<{ user: User; token: string }> {
    const mail = normalizeEmail(input.mail);
    const password = input.password;

    if (!mail || !password)
      throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

    const authUser = await this.users.findAuthByEmail(mail);
    if (!authUser)
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

    const ok = await bcrypt.compare(password, authUser.passwordHash);
    if (!ok)
      throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

    if (authUser.status === 'inactive')
      throw unauthorized('Email is not validated', 'EMAIL_NOT_VALIDATED');

    if (authUser.status === 'banned')
      throw unauthorized('User is banned', 'USER_BANNED');

    const { passwordHash: _ph, ...user } = authUser;
    const token = this.signToken(user);

    return { user, token };
  }
}
