export const ADMIN_AUDIT_EVENT_TYPES = {
  commentsDelete: 'comments.delete',
  commentsHide: 'comments.hide',
  commentsRestore: 'comments.restore',
  commentsUnmoderate: 'comments.unmoderate',
  commentsUpdate: 'comments.update',
  recipesApprove: 'recipes.approve',
  recipesArchive: 'recipes.archive',
  recipesDelete: 'recipes.delete',
  recipesReject: 'recipes.reject',
  staffSessionRevoke: 'staff.sessions.revoke',
  usersBan: 'users.ban',
  usersUnban: 'users.unban'
} as const;

export type AdminAuditEventType = typeof ADMIN_AUDIT_EVENT_TYPES[keyof typeof ADMIN_AUDIT_EVENT_TYPES];

export const ADMIN_AUDIT_TARGET_TYPES = {
  comment: 'comment',
  communityUser: 'community_user',
  recipe: 'recipe',
  staffSession: 'staff_session'
} as const;

export type AdminAuditTargetType = typeof ADMIN_AUDIT_TARGET_TYPES[keyof typeof ADMIN_AUDIT_TARGET_TYPES];

export const ADMIN_AUDIT_EVENT_TARGET_TYPES: Readonly<Record<AdminAuditEventType, AdminAuditTargetType>> = {
  [ADMIN_AUDIT_EVENT_TYPES.commentsDelete]: ADMIN_AUDIT_TARGET_TYPES.comment,
  [ADMIN_AUDIT_EVENT_TYPES.commentsHide]: ADMIN_AUDIT_TARGET_TYPES.comment,
  [ADMIN_AUDIT_EVENT_TYPES.commentsRestore]: ADMIN_AUDIT_TARGET_TYPES.comment,
  [ADMIN_AUDIT_EVENT_TYPES.commentsUnmoderate]: ADMIN_AUDIT_TARGET_TYPES.comment,
  [ADMIN_AUDIT_EVENT_TYPES.commentsUpdate]: ADMIN_AUDIT_TARGET_TYPES.comment,
  [ADMIN_AUDIT_EVENT_TYPES.recipesApprove]: ADMIN_AUDIT_TARGET_TYPES.recipe,
  [ADMIN_AUDIT_EVENT_TYPES.recipesArchive]: ADMIN_AUDIT_TARGET_TYPES.recipe,
  [ADMIN_AUDIT_EVENT_TYPES.recipesDelete]: ADMIN_AUDIT_TARGET_TYPES.recipe,
  [ADMIN_AUDIT_EVENT_TYPES.recipesReject]: ADMIN_AUDIT_TARGET_TYPES.recipe,
  [ADMIN_AUDIT_EVENT_TYPES.staffSessionRevoke]: ADMIN_AUDIT_TARGET_TYPES.staffSession,
  [ADMIN_AUDIT_EVENT_TYPES.usersBan]: ADMIN_AUDIT_TARGET_TYPES.communityUser,
  [ADMIN_AUDIT_EVENT_TYPES.usersUnban]: ADMIN_AUDIT_TARGET_TYPES.communityUser
};
