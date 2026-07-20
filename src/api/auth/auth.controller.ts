import {
    parseLoginBody,
    parseRegisterBody,
    parseResendValidationEmailBody,
    parseResetPasswordBody,
    parseStaffInvitationActivationBody,
    parseStaffLoginVerificationBody,
    parseStaffMfaEnrollmentOptionsBody,
    parseValidateEmailBody
} from './auth.dto.js';
import { unauthorized } from '../../utils/errors.js';
import { clearSessionCookie, getSessionToken, setSessionCookie } from '../../utils/session-cookie.js';
import { asyncHandler } from '../http/async-handler.js';

import type { AuthService } from '../../services/auth/auth.service.js';
import type { EmailValidationService } from '../../services/auth/email-validation.service.js';
import type { PasswordResetService } from '../../services/auth/password-reset.service.js';
import type { Handler } from '../http/http.types.js';

export function createAuthController(
    authService: AuthService,
    passwordResetService: PasswordResetService,
    emailValidationService: EmailValidationService
) {
    const register = asyncHandler(async (req, res) => {
        const input = parseRegisterBody(req.body);
        const result = await authService.register(input);

        res.status(201).json(result);
    });

    const login = asyncHandler(async (req, res) => {
        const input = parseLoginBody(req.body);
        const { token, user } = await authService.loginCommunity(input);

        setSessionCookie(res, 'app', token);

        res.status(200).json({ user });
    });

    const staffLoginOptions = asyncHandler(async (req, res) => {
        const input = parseLoginBody(req.body);
        const result = await authService.beginStaffLogin(input);

        res.status(200).json(result);
    });

    const staffLoginVerify = asyncHandler(async (req, res) => {
        const input = {
            ...parseStaffLoginVerificationBody(req.body),
            ...getStaffSessionMetadata(req)
        };
        const { token, user } = await authService.completeStaffLogin(input);

        setSessionCookie(res, 'admin', token);

        res.status(200).json({ user });
    });

    const staffMfaEnrollmentOptions = asyncHandler(async (req, res) => {
        const { invitationToken } = parseStaffMfaEnrollmentOptionsBody(req.body);
        const result = await authService.beginStaffMfaEnrollment(invitationToken);

        res.status(200).json(result);
    });

    const activateStaffInvitation = asyncHandler(async (req, res) => {
        const input = parseStaffInvitationActivationBody(req.params.token, req.body);
        const result = await authService.activateStaffInvitation(input);

        res.status(200).json(result);
    });

    const me: Handler = (req, res) => {
        if (!req.auth) throw unauthorized('Unauthorized', 'AUTH_UNAUTHORIZED');

        res.status(200).json({ auth: req.auth });
    };

    const logout: Handler = asyncHandler(async (req, res) => {
        await authService.logout(getSessionToken(req, 'app'), 'app');
        clearSessionCookie(res, 'app');

        res.status(200).json({ ok: true });
    });

    const staffLogout: Handler = asyncHandler(async (req, res) => {
        await authService.logout(getSessionToken(req, 'admin'), 'admin');
        clearSessionCookie(res, 'admin');

        res.status(200).json({ ok: true });
    });

    const forgotPassword: Handler = asyncHandler(async (req, res) => {
        const mail = typeof req.body?.mail === 'string' ? req.body.mail : '';

        if (!mail.trim()) {
            res.status(400).json({ error: { message: 'Email is required', code: 'AUTH_FORGOT_PASSWORD_INVALID_EMAIL' } });

            return;
        }

        await passwordResetService.requestReset(mail);

        res.status(200).json({ ok: true, message: 'If an account exists for this email, a password reset link has been sent.' });
    });

    const resetPassword: Handler = asyncHandler(async (req, res) => {
        const input = parseResetPasswordBody(req.body);

        await passwordResetService.resetPassword(input.token, input.password);

        res.status(200).json({ ok: true, message: 'Password has been reset successfully.' });
    });

    const validateEmail: Handler = asyncHandler(async (req, res) => {
        const input = parseValidateEmailBody(req.body);
        const user = await emailValidationService.validateEmail(input.token);

        res.status(200).json({ ok: true, message: 'Email has been validated successfully.', user });
    });

    const resendValidationEmail: Handler = asyncHandler(async (req, res) => {
        const input = parseResendValidationEmailBody(req.body);

        await emailValidationService.resendValidationEmail(input.mail);

        res.status(200).json({ ok: true, message: 'If an inactive account exists for this email, a validation link has been sent.' });
    });

    return {
        register,
        login,
        staffLoginOptions,
        staffLoginVerify,
        staffMfaEnrollmentOptions,
        activateStaffInvitation,
        me,
        logout,
        staffLogout,
        forgotPassword,
        resetPassword,
        validateEmail,
        resendValidationEmail
    };
}

function getStaffSessionMetadata(req: Parameters<Handler>[0]): { ipAddress: string | null; userAgent: string | null } {
    const rawIpAddress = typeof req.ip === 'string' ? req.ip.trim() : '';
    const rawUserAgent = req.headers?.['user-agent'];
    const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;

    return {
        ipAddress: rawIpAddress && rawIpAddress.length <= 45 ? rawIpAddress : null,
        userAgent: typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim().slice(0, 512) : null
    };
}
