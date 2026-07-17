export type AdminAuditJsonPrimitive = boolean | number | string | null;
export type AdminAuditJsonValue = AdminAuditJsonPrimitive | readonly AdminAuditJsonValue[] | { readonly [key: string]: AdminAuditJsonValue };
export type AdminAuditSnapshot = Readonly<Record<string, AdminAuditJsonValue>>;

export type CreateAdminAuditLogInput = {
  actorUserId: number;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  beforeValues: AdminAuditSnapshot | null;
  afterValues: AdminAuditSnapshot | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string;
};

export interface AdminAuditRepository {
  create(input: CreateAdminAuditLogInput): Promise<number>;
}
