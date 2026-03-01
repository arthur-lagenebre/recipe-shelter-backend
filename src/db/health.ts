import type { RowDataPacket } from "mysql2/promise";
import { one } from "./query.js";

export async function dbHealth(): Promise<boolean> {
    try {
        const row = await one<RowDataPacket & { v: string }>("SELECT VERSION() AS v");
        
        return typeof row?.v === "string";
    } catch {
        return false;
    }
}