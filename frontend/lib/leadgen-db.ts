import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
let pool: Pool | null = null;

function getLeadgenPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required for leadgen database access");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL.replace(/^postgres:\/\//, "postgresql://"),
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export const leadgenPool = {
  query(text: string, values?: unknown[]) {
    return getLeadgenPool().query(text, values);
  },
};
