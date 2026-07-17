import { PERMISSIONS } from '../../security/permissions.js';

import type { AuthorizationPolicy } from '../../middlewares/authorization.js';

export const adminAuthorizationPolicies = [
  { method: 'get', path: '/audit-logs', permission: PERMISSIONS.auditRead },
  { method: 'get', path: '/comments/moderated', permission: PERMISSIONS.commentsRead },
  { method: 'get', path: '/comments/moderated/count', permission: PERMISSIONS.commentsRead },
  { method: 'get', path: '/comments/soft-deleted', permission: PERMISSIONS.commentsRead },
  { method: 'get', path: '/comments/soft-deleted/count', permission: PERMISSIONS.commentsRead },
  { method: 'post', path: '/comments/:id/hide', permission: PERMISSIONS.commentsModerate },
  { method: 'post', path: '/comments/:id/unmoderate', permission: PERMISSIONS.commentsModerate },
  { method: 'post', path: '/comments/:id/restore', permission: PERMISSIONS.commentsModerate },
  { method: 'patch', path: '/comments/:id', permission: PERMISSIONS.commentsUpdate },
  { method: 'delete', path: '/comments/:id', permission: PERMISSIONS.commentsDelete },
  { method: 'get', path: '/recipes/pending', permission: PERMISSIONS.recipesRead },
  { method: 'get', path: '/recipes/pending/count', permission: PERMISSIONS.recipesRead },
  { method: 'get', path: '/recipes/:id', permission: PERMISSIONS.recipesRead },
  { method: 'post', path: '/recipes/:id/approve', permission: PERMISSIONS.recipesModerate },
  { method: 'post', path: '/recipes/:id/reject', permission: PERMISSIONS.recipesModerate },
  { method: 'post', path: '/recipes/:id/archive', permission: PERMISSIONS.recipesArchive },
  { method: 'delete', path: '/recipes/:id', permission: PERMISSIONS.recipesDelete },
  { method: 'get', path: '/users/banned', permission: PERMISSIONS.usersRead },
  { method: 'get', path: '/users/banned/count', permission: PERMISSIONS.usersRead },
  { method: 'get', path: '/users/:id', permission: PERMISSIONS.usersRead },
  { method: 'post', path: '/users/:id/ban', permission: PERMISSIONS.usersModerate },
  { method: 'post', path: '/users/:id/unban', permission: PERMISSIONS.usersModerate },
  { method: 'get', path: '/staff/:staffUserId/sessions', permission: PERMISSIONS.staffRead },
  { method: 'delete', path: '/staff/:staffUserId/sessions/:sessionId', permission: PERMISSIONS.staffSessionRevoke }
] as const satisfies readonly AuthorizationPolicy[];
