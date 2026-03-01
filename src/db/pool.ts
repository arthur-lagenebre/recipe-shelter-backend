import mysql from "mysql2/promise";
import { dbConfig } from "./config.js";

export const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: dbConfig.poolMax,
    enableKeepAlive: true,
    timezone: "Z",
});