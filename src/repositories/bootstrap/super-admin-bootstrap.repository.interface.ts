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

export type BeforeFirstSuperAdminCommit = (created: { userId: number }) => Promise<void>;

export interface SuperAdminBootstrapRepository {
    createFirst(input: CreateFirstSuperAdminInput, beforeCommit: BeforeFirstSuperAdminCommit): Promise<CreateFirstSuperAdminResult>;
}
