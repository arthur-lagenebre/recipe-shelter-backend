function getString(name: string, fallback?: string): string {
    const valueStr = process.env[name];

    if (!valueStr) {
        if (fallback !== undefined)
            return fallback;

        throw new Error(`Missing env var: ${name}`);
    }

    return valueStr;
}

function getInt(name: string, fallback: number): number {
    const valueStr = process.env[name];

    if (!valueStr)
        return fallback;

    const valueNumber = Number.parseInt(valueStr, 10);

    if (Number.isNaN(valueNumber))
        throw new Error(`Invalid int env var: ${name}`);

    return valueNumber;
}

export const env = {
    http: {
        port: getInt('PORT', 3000),
        corsAllowedOrigins: getString('CORS_ALLOWED_ORIGINS', 'http://localhost:4200')
    },
    db: {
        host: getString('DB_HOST'),
        port: getInt('DB_PORT', 3306),
        user: getString('DB_USER'),
        connectionLimit: getInt('DB_CONNECTION_LIMIT', 10),
        password: getString('DB_PASSWORD'),
        name: getString('DB_NAME'),
    },
    auth: {
        jwtSecret: getString('JWT_SECRET'),
        jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as string | number,
        bcryptCost: getInt('BCRYPT_COST', 12),
        defaultRoleName: process.env.AUTH_DEFAULT_ROLE ?? 'User',
    },
};