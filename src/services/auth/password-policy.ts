export function validatePassword(password: string): string | null {
    if (typeof password !== 'string' || password.length === 0) return 'Password is required';

    if (password.length < 8) return 'Password must be at least 8 characters';

    if (password.length > 128) return 'Password must be at most 128 characters';

    return null;
}
