import type { AdminAuditRequestContext } from '../../services/admin/admin-audit.service.js';
import type { Handler } from '../http/http.types.js';

export function getAdminAuditRequestContext(req: Parameters<Handler>[0]): AdminAuditRequestContext {
  const rawIpAddress = typeof req.ip === 'string' ? req.ip.trim() : '';
  const rawUserAgent = req.headers['user-agent'];
  const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;

  return {
    ipAddress: rawIpAddress && rawIpAddress.length <= 45 ? rawIpAddress : null,
    userAgent: typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim().slice(0, 512) : null
  };
}
