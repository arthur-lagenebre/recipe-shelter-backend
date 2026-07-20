import { PERMISSIONS } from '../../security/permissions.js';

import type { AuthorizationPolicy } from '../../middlewares/authorization.js';

export const adminAuthorizationPolicies = [
  { method: 'get', path: '/audit-logs', permission: PERMISSIONS.auditRead },
  { method: 'get', path: '/comments/moderated', permission: PERMISSIONS.commentReview },
  { method: 'get', path: '/comments/moderated/count', permission: PERMISSIONS.commentReview },
  { method: 'get', path: '/comments/soft-deleted', permission: PERMISSIONS.commentReview },
  { method: 'get', path: '/comments/soft-deleted/count', permission: PERMISSIONS.commentReview },
  { method: 'post', path: '/comments/:id/hide', permission: PERMISSIONS.commentHide },
  { method: 'post', path: '/comments/:id/unmoderate', permission: PERMISSIONS.commentRestore },
  { method: 'post', path: '/comments/:id/restore', permission: PERMISSIONS.commentRestore },
  { method: 'patch', path: '/comments/:id', permission: PERMISSIONS.commentsUpdate },
  { method: 'delete', path: '/comments/:id', permission: PERMISSIONS.commentsDelete },
  { method: 'get', path: '/recipes/pending', permission: PERMISSIONS.recipeReview },
  { method: 'get', path: '/recipes/pending/count', permission: PERMISSIONS.recipeReview },
  { method: 'get', path: '/recipes/:id', permission: PERMISSIONS.recipeReview },
  { method: 'post', path: '/recipes/:id/approve', permission: PERMISSIONS.recipePublish },
  { method: 'post', path: '/recipes/:id/reject', permission: PERMISSIONS.recipeReject },
  { method: 'post', path: '/recipes/:id/archive', permission: PERMISSIONS.recipeArchive },
  { method: 'delete', path: '/recipes/:id', permission: PERMISSIONS.recipesDelete },
  { method: 'get', path: '/users/banned', permission: PERMISSIONS.userRead },
  { method: 'get', path: '/users/banned/count', permission: PERMISSIONS.userRead },
  { method: 'get', path: '/users/:id', permission: PERMISSIONS.userRead },
  { method: 'post', path: '/users/:id/ban', permission: PERMISSIONS.userBan },
  { method: 'post', path: '/users/:id/unban', permission: PERMISSIONS.userUnban },
  { method: 'post', path: '/staff/invitations', permission: PERMISSIONS.staffCreate },
  { method: 'get', path: '/staff', permission: PERMISSIONS.staffRead },
  { method: 'get', path: '/staff/:staffUserId', permission: PERMISSIONS.staffRead },
  { method: 'post', path: '/staff/:staffUserId/disable', permission: PERMISSIONS.staffDisable },
  { method: 'post', path: '/staff/:staffUserId/enable', permission: PERMISSIONS.staffEnable },
  { method: 'post', path: '/staff/:staffUserId/roles/:roleCode', permission: PERMISSIONS.staffRoleGrant },
  { method: 'delete', path: '/staff/:staffUserId/roles/:roleCode', permission: PERMISSIONS.staffRoleRevoke },
  { method: 'get', path: '/staff/:staffUserId/sessions', permission: PERMISSIONS.staffRead },
  { method: 'delete', path: '/staff/:staffUserId/sessions/:sessionId', permission: PERMISSIONS.staffSessionRevoke }
] as const satisfies readonly AuthorizationPolicy[];
