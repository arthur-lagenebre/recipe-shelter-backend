export type User = {
    id: number;
    mail: string;
    username: string;
    roleId: number;
    createdAt: Date;
    updatedAt: Date;
};

export type UserWithPassword = User & {
    passwordHash: string;
};

export type CreateUserInput = {
    mail: string;
    username: string;
    passwordHash: string;
    roleId: number;
};