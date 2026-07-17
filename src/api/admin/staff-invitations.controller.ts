import { getAdminAuditRequestContext } from './admin-audit.context.js';
import { parseCreateStaffInvitationBody } from './staff-invitations.dto.js';
import { asyncHandler } from '../http/async-handler.js';

import type { StaffInvitationService } from '../../services/admin/staff-invitation.service.js';

export function createStaffInvitationsController(staffInvitations: StaffInvitationService) {
  return {
    create: asyncHandler(async (req, res) => {
      const command = parseCreateStaffInvitationBody(req.body);
      const invitation = await staffInvitations.create(
        command,
        req.auth!.userId,
        getAdminAuditRequestContext(req)
      );

      res.status(201).json(invitation);
    })
  };
}
