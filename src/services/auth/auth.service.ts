import bcrypt from 'bcrypt';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { env } from '../../utils/env.js';
import { conflict, unauthorized, badRequest } from '../../utils/errors.js';
import type { IUserRepository } from '../../repositories/users/IUserRepository.js';
import type { User } from '../../repositories/users/user.types.js';

export type AuthTokenPayload = {
    sub: number;
    username: string;
    roleId: number;
};

export class AuthService {
    constructor(private readonly users: IUserRepository) { }

    private signToken(user: User): string {
        const payload: AuthTokenPayload = { sub: user.id, username: user.username, roleId: user.roleId };
        const secret: Secret = env.auth.jwtSecret;
        const options: SignOptions = { expiresIn: env.auth.jwtExpiresIn as SignOptions['expiresIn'], };

        return jwt.sign(payload, secret, options);
    }

    async register(input: { mail: string; username: string; password: string }): Promise<{ user: User; token: string }> {
        const mail = input.mail.trim().toLowerCase();
        const username = input.username.trim();
        const password = input.password;

        if (!mail || !username || !password)
            throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');
        if (password.length < 8)
            throw badRequest('Password must be at least 8 characters', 'AUTH_WEAK_PASSWORD');
        if (await this.users.isEmailTaken(mail))
            throw conflict('Email already used', 'AUTH_EMAIL_TAKEN');
        if (await this.users.isUsernameTaken(username))
            throw conflict('Username already used', 'AUTH_USERNAME_TAKEN');

        const roleId = await this.users.getRoleIdByName(env.auth.defaultRoleName);

        if (!roleId)
            throw new Error(`Default role not found: ${env.auth.defaultRoleName}`);

        const passwordHash = await bcrypt.hash(password, env.auth.bcryptCost);
        const user = await this.users.create({ mail, username, passwordHash, roleId });
        const token = this.signToken(user);

        return { user, token };
    }

    async login(input: { mail: string; password: string }): Promise<{ user: User; token: string }> {
        const mail = input.mail.trim().toLowerCase();
        const password = input.password;

        if (!mail || !password)
            throw badRequest('Missing fields', 'AUTH_MISSING_FIELDS');

        const authUser = await this.users.findAuthByEmail(mail);
        if (!authUser)
            throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

        const ok = await bcrypt.compare(password, authUser.passwordHash);
        if (!ok)
            throw unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

        const { passwordHash: _ph, ...user } = authUser;
        const token = this.signToken(user);

        return { user, token };
    }
}