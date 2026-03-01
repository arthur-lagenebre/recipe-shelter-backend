export type DbConfig = {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    poolMax: number;
    debug: boolean;
};

function required(name: string): string {
    const v = process.env[name];

    if (!v)
        throw new Error(`Missing env var: ${name}`);

    return v;
}

export const dbConfig: DbConfig = {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    database: required("DB_NAME"),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    poolMax: Number(process.env.DB_POOL_MAX ?? 10),
    debug: String(process.env.DB_DEBUG ?? "false").toLowerCase() === "true",
};