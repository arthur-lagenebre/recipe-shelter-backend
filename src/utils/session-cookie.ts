import { env } from './env.js';

import type { CookieOptions, Response } from 'express';

export const sessionCookieName = env.auth.sessionCookieName;

function getBaseSessionCookieOptions(): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: env.auth.sessionCookieSameSite,
    secure: env.auth.sessionCookieSecure
  };

  if (env.auth.sessionCookieDomain)
    options.domain = env.auth.sessionCookieDomain;

  return options;
}

export function getSessionCookieOptions(): CookieOptions {
  return {
    ...getBaseSessionCookieOptions(),
    maxAge: env.auth.sessionCookieMaxAgeMs
  };
}

export function getSessionClearCookieOptions(): CookieOptions {
  return getBaseSessionCookieOptions();
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookieName, token, getSessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName, getSessionClearCookieOptions());
}
