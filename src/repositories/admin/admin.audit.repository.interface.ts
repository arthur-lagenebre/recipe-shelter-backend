export type AdminAuditJsonPrimitive = boolean | number | string | null;
export type AdminAuditJsonValue =
    AdminAuditJsonPrimitive | readonly AdminAuditJsonValue[] | { readonly [key: string]: AdminAuditJsonValue };
export type AdminAuditSnapshot = Readonly<Record<string, AdminAuditJsonValue>>;

export type CreateAdminAuditLogInput = {
    readonly actorUserId: number;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly reason: string | null;
    readonly beforeValues: AdminAuditSnapshot | null;
    readonly afterValues: AdminAuditSnapshot | null;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
    readonly correlationId: string;
};

/** Append-only persistence boundary: audit records have no update or delete operation. */
export interface AdminAuditRepository {
    create(input: CreateAdminAuditLogInput): Promise<number>;
}
