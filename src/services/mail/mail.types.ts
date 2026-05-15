export interface PasswordResetMailInput {
    to: string;
    username: string;
    resetUrl: string;
}

export interface PasswordChangedMailInput {
    to: string;
    username: string;
}

export interface EmailValidationMailInput {
    to: string;
    username: string;
    validationUrl: string;
}

export interface ContactMailInput {
    name: string;
    email: string;
    subject: string;
    message: string;
    sentAt: Date;
}

export interface Mailer {
    sendPasswordResetEmail(input: PasswordResetMailInput): Promise<void>;
    sendPasswordChangedEmail(input: PasswordChangedMailInput): Promise<void>;
    sendEmailValidationEmail(input: EmailValidationMailInput): Promise<void>;
    sendContactEmail(input: ContactMailInput): Promise<void>;
}