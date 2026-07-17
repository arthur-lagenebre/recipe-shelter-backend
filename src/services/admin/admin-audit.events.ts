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
  staffDisable: 'staff.disable',
  staffEnable: 'staff.enable',
  staffInvitationCreate: 'staff.invitations.create',
  staffList: 'staff.list',
  staffRead: 'staff.read',
  staffRoleGrant: 'staff.roles.grant',
  staffRoleRevoke: 'staff.roles.revoke',
  staffSessionList: 'staff.sessions.list',
  staffSessionRevoke: 'staff.sessions.revoke',
  usersBan: 'users.ban',
  usersUnban: 'users.unban'
} as const;

export type AdminAuditEventType = typeof ADMIN_AUDIT_EVENT_TYPES[keyof typeof ADMIN_AUDIT_EVENT_TYPES];

export const ADMIN_AUDIT_TARGET_TYPES = {
  comment: 'comment',
  communityUser: 'community_user',
  recipe: 'recipe',
  staffCollection: 'staff_collection',
  staffInvitation: 'staff_invitation',
  staffSession: 'staff_session',
  staffUser: 'staff_user'
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
  [ADMIN_AUDIT_EVENT_TYPES.staffDisable]: ADMIN_AUDIT_TARGET_TYPES.staffUser,
  [ADMIN_AUDIT_EVENT_TYPES.staffEnable]: ADMIN_AUDIT_TARGET_TYPES.staffUser,
  [ADMIN_AUDIT_EVENT_TYPES.staffInvitationCreate]: ADMIN_AUDIT_TARGET_TYPES.staffInvitation,
  [ADMIN_AUDIT_EVENT_TYPES.staffList]: ADMIN_AUDIT_TARGET_TYPES.staffCollection,
  [ADMIN_AUDIT_EVENT_TYPES.staffRead]: ADMIN_AUDIT_TARGET_TYPES.staffUser,
  [ADMIN_AUDIT_EVENT_TYPES.staffRoleGrant]: ADMIN_AUDIT_TARGET_TYPES.staffUser,
  [ADMIN_AUDIT_EVENT_TYPES.staffRoleRevoke]: ADMIN_AUDIT_TARGET_TYPES.staffUser,
  [ADMIN_AUDIT_EVENT_TYPES.staffSessionList]: ADMIN_AUDIT_TARGET_TYPES.staffUser,
  [ADMIN_AUDIT_EVENT_TYPES.staffSessionRevoke]: ADMIN_AUDIT_TARGET_TYPES.staffSession,
  [ADMIN_AUDIT_EVENT_TYPES.usersBan]: ADMIN_AUDIT_TARGET_TYPES.communityUser,
  [ADMIN_AUDIT_EVENT_TYPES.usersUnban]: ADMIN_AUDIT_TARGET_TYPES.communityUser
};
