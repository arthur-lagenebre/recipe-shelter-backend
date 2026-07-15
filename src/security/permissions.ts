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
  commentsDelete: 'comments.delete'
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];
