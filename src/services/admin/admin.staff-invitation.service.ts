import { ADMIN_AUDIT_EVENT_TYPES, ADMIN_AUDIT_TARGET_TYPES } from './admin.audit.events.js';
import { env } from '../../utils/env.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { generateStaffInvitationToken, hashStaffInvitationToken } from '../../utils/security/staff-invitation-token.js';
import { normalizeEmail } from '../../utils/string.js';

import type { AdminAuditActionRunner } from './admin.audit-action.runner.js';
import type { AdminAuditRequestContext } from './admin.audit.service.js';
import type { StaffInvitation, StaffInvitationRepository } from '../../repositories/admin/admin.staff-invitation.repository.interface.js';
import type { StaffInvitationMailer } from '../mail/mail.types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MIN_DISPLAY_NAME_LENGTH = 3;
const MAX_DISPLAY_NAME_LENGTH = 64;
const MAX_ROLE_COUNT = 20;
const MAX_ROLE_CODE_LENGTH = 64;

export type CreateStaffInvitationCommand = {
    email: string;
    displayName: string;
    roles: string[];
};

type StaffInvitationServiceOptions = {
    invitationTtlMinutes?: number;
    generateToken?: () => string;
    hashToken?: (token: string) => string;
};

export class StaffInvitationService {
    private readonly invitationTtlMinutes: number;
    private readonly generateToken: () => string;
    private readonly hashToken: (token: string) => string;

    constructor(
        private readonly invitations: StaffInvitationRepository,
        private readonly mailer: StaffInvitationMailer,
        private readonly auditActions: AdminAuditActionRunner,
        private readonly appBaseUrl: string,
        options: StaffInvitationServiceOptions = {}
    ) {
        this.invitationTtlMinutes = options.invitationTtlMinutes ?? env.staff.invitationTtlMinutes;
        this.generateToken = options.generateToken ?? generateStaffInvitationToken;
        this.hashToken = options.hashToken ?? hashStaffInvitationToken;

        if (!Number.isInteger(this.invitationTtlMinutes) || this.invitationTtlMinutes <= 0)
            throw new TypeError('Staff invitation TTL must be a positive integer');
    }

    async create(input: CreateStaffInvitationCommand, actorUserId: number, context: AdminAuditRequestContext): Promise<StaffInvitation> {
        const command = validateCommand(input);
        const rawToken = this.generateToken();
        const tokenHash = this.hashToken(rawToken);

        return this.auditActions.run(async ({ db, audit }) => {
            const result = await this.invitations.create(
                {
                    email: command.email,
                    displayName: command.displayName,
                    roleCodes: command.roles,
                    tokenHash,
                    invitationTtlMinutes: this.invitationTtlMinutes,
                    createdByStaffUserId: actorUserId
                },
                db
            );

            switch (result.status) {
                case 'invitation_exists':
                    throw conflict('A staff invitation already exists for this email', 'STAFF_INVITATION_ALREADY_EXISTS');
                case 'email_taken':
                    throw conflict('Email already used', 'STAFF_EMAIL_ALREADY_EXISTS');
                case 'display_name_taken':
                    throw conflict('Display name already used', 'STAFF_DISPLAY_NAME_ALREADY_EXISTS');
                case 'roles_missing':
                    throw badRequest('One or more staff roles do not exist', 'STAFF_INVITATION_ROLES_INVALID');
                case 'created': {
                    const invitation = result.invitation;

                    await audit.record({
                        actorUserId,
                        eventType: ADMIN_AUDIT_EVENT_TYPES.staffInvitationCreate,
                        targetType: ADMIN_AUDIT_TARGET_TYPES.staffInvitation,
                        targetId: invitation.id,
                        afterValues: {
                            staffUserId: invitation.staffUserId,
                            displayName: invitation.displayName,
                            status: invitation.status,
                            roles: invitation.roles.map((role) => role.code),
                            expiresAt: invitation.expiresAt.toISOString()
                        },
                        ...context
                    });

                    const invitationUrl = `${this.appBaseUrl.replace(/\/+$/, '')}/auth/staff-invitation?token=${encodeURIComponent(rawToken)}`;
                    await this.mailer.sendStaffInvitationEmail({
                        to: invitation.email,
                        displayName: invitation.displayName,
                        invitationUrl,
                        expiresInMinutes: this.invitationTtlMinutes
                    });

                    return invitation;
                }
            }
        });
    }
}

function validateCommand(input: CreateStaffInvitationCommand): CreateStaffInvitationCommand {
    const email = normalizeEmail(typeof input.email === 'string' ? input.email : '');
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';

    if (!email)
        throw badRequest('Email is required', 'STAFF_INVITATION_EMAIL_REQUIRED');
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))
        throw badRequest('Invalid email', 'STAFF_INVITATION_EMAIL_INVALID');
    if (!displayName)
        throw badRequest('Display name is required', 'STAFF_INVITATION_DISPLAY_NAME_REQUIRED');
    if (displayName.length < MIN_DISPLAY_NAME_LENGTH)
        throw badRequest('Display name is too short', 'STAFF_INVITATION_DISPLAY_NAME_TOO_SHORT');
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH)
        throw badRequest('Display name is too long', 'STAFF_INVITATION_DISPLAY_NAME_TOO_LONG');
    if (!Array.isArray(input.roles) || input.roles.length === 0)
        throw badRequest('At least one initial role is required', 'STAFF_INVITATION_ROLES_REQUIRED');
    if (input.roles.length > MAX_ROLE_COUNT)
        throw badRequest('Too many initial roles', 'STAFF_INVITATION_ROLES_INVALID');

    const roles = input.roles.map((role) => (typeof role === 'string' ? role.trim() : ''));
    if (roles.some((role) => !role || role.length > MAX_ROLE_CODE_LENGTH))
        throw badRequest('Invalid initial role code', 'STAFF_INVITATION_ROLES_INVALID');
    if (new Set(roles).size !== roles.length)
        throw badRequest('Initial role codes must be unique', 'STAFF_INVITATION_ROLES_DUPLICATE');

    return { email, displayName, roles };
}
