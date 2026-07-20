export const PERMISSIONS = {
  systemHealthRead: 'system.health.read',
  usersRead: 'users.read',
  usersModerate: 'users.moderate',
  recipeReview: 'recipe.review',
  recipePublish: 'recipe.publish',
  recipeReject: 'recipe.reject',
  recipeArchive: 'recipe.archive',
  recipesDelete: 'recipes.delete',
  commentsRead: 'comments.read',
  commentsModerate: 'comments.moderate',
  commentsUpdate: 'comments.update',
  commentsDelete: 'comments.delete',
  catalogRead: 'catalog.read',
  catalogManage: 'catalog.manage',
  staffRead: 'staff.read',
  staffCreate: 'staff.create',
  staffDisable: 'staff.disable',
  staffEnable: 'staff.enable',
  staffRoleGrant: 'staff.role.grant',
  staffRoleRevoke: 'staff.role.revoke',
  staffSessionRevoke: 'staff.session.revoke',
  auditRead: 'audit.read'
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const KNOWN_PERMISSION_CODES = new Set<string>(Object.values(PERMISSIONS));

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && KNOWN_PERMISSION_CODES.has(value);
}
