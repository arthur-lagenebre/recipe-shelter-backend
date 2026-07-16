export const PERMISSIONS = {
  systemHealthRead: 'system.health.read',
  usersRead: 'users.read',
  usersModerate: 'users.moderate',
  recipesRead: 'recipes.read',
  recipesModerate: 'recipes.moderate',
  recipesArchive: 'recipes.archive',
  recipesDelete: 'recipes.delete',
  commentsRead: 'comments.read',
  commentsModerate: 'comments.moderate',
  commentsUpdate: 'comments.update',
  commentsDelete: 'comments.delete',
  catalogRead: 'catalog.read',
  catalogManage: 'catalog.manage',
  staffRead: 'staff.read',
  staffManage: 'staff.manage',
  staffSessionRevoke: 'staff.session.revoke',
  auditRead: 'audit.read'
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const KNOWN_PERMISSION_CODES = new Set<string>(Object.values(PERMISSIONS));

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && KNOWN_PERMISSION_CODES.has(value);
}
