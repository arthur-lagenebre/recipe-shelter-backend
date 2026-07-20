export function firstOrNull<T>(rows: T[]): T | null {
    return rows.length ? rows[0] : null;
}
