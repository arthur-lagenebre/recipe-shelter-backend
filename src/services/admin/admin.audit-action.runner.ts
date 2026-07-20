import { internalError } from '../../utils/errors.js';

import type { AdminAuditRecorder } from './admin.audit.service.js';
import type { Pool, PoolConnection } from 'mysql2/promise';

export type AdminAuditActionScope = {
  db: PoolConnection;
  audit: AdminAuditRecorder;
};

export interface AdminAuditActionRunner {
  run<T>(action: (scope: AdminAuditActionScope) => Promise<T>): Promise<T>;
}

export class AdminAuditActionRunnerMysql implements AdminAuditActionRunner {
  constructor(
    private readonly pool: Pick<Pool, 'getConnection'>,
    private readonly createAuditRecorder: (db: PoolConnection) => AdminAuditRecorder
  ) { }

  async run<T>(action: (scope: AdminAuditActionScope) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      let auditCount = 0;
      const audit = this.createAuditRecorder(connection);
      const result = await action({
        db: connection,
        audit: {
          record: async (input) => {
            auditCount += 1;

            if (auditCount > 1)
              throw invalidAuditCardinality();

            return audit.record(input);
          }
        }
      });

      const expectedAuditCount = result === false ? 0 : 1;
      if (auditCount !== expectedAuditCount)
        throw invalidAuditCardinality();

      await connection.commit();

      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function invalidAuditCardinality() {
  return internalError(
    'Administrative action could not be audited',
    'ADMIN_AUDIT_RECORD_FAILED'
  );
}
