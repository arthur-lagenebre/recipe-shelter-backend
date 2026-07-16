export type CreateFirstSuperAdminInput = {
    mail: string;
    username: string;
    invitationTokenHash: string;
    invitationTtlMinutes: number;
};

export type CreateFirstSuperAdminResult =
    | { status: 'created'; userId: number }
    | { status: 'super_admin_exists'; active: boolean }
    | { status: 'email_taken' }
    | { status: 'username_taken' }
    | { status: 'role_missing' };

export interface SuperAdminBootstrapRepository {
    createFirst(input: CreateFirstSuperAdminInput): Promise<CreateFirstSuperAdminResult>;
    cancelPendingInvitation(userId: number, tokenHash: string): Promise<boolean>;
}
