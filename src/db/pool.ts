import mysql from 'mysql2/promise';

import { env } from '../utils/env.js';

export const pool = mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: 'Z',
    namedPlaceholders: true
});
