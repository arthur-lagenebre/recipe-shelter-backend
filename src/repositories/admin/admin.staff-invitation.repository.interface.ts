import type { PoolConnection } from 'mysql2/promise';

export type StaffInvitationRole = {
    id: number;
    code: string;
    name: string;
};

export type StaffInvitation = {
    id: number;
    staffUserId: number;
    email: string;
    displayName: string;
    status: 'invited';
    roles: StaffInvitationRole[];
    expiresAt: Date;
    createdAt: Date;
};

export type CreateStaffInvitationInput = {
    email: string;
    displayName: string;
    roleCodes: string[];
    tokenHash: string;
    invitationTtlMinutes: number;
    createdByStaffUserId: number;
};

export type CreateStaffInvitationResult =
    | { status: 'created'; invitation: StaffInvitation }
    | { status: 'invitation_exists'; invitationId: number }
    | { status: 'email_taken' }
    | { status: 'display_name_taken' }
    | { status: 'roles_missing'; roleCodes: string[] };

export interface StaffInvitationRepository {
    create(input: CreateStaffInvitationInput, db?: PoolConnection): Promise<CreateStaffInvitationResult>;
}
