export class DbError extends Error {
  public code?: string;
  public sqlState?: string;
  public errno?: number;

  constructor(message: string, opts?: { code?: string; sqlState?: string; errno?: number }) {
    super(message);
    this.name = "DbError";
    this.code = opts?.code;
    this.sqlState = opts?.sqlState;
    this.errno = opts?.errno;
  }
}

export function toDbError(err: unknown, sql?: string): DbError {
  const e = err as any;
  const msg = e?.message ? String(e.message) : "Database error";
  const hint = sql ? ` | SQL: ${sql}` : "";
  
  return new DbError(`${msg}${hint}`, {
    code: e?.code,
    sqlState: e?.sqlState,
    errno: e?.errno,
  });
}