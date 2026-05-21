import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://sales:sales123@localhost:5433/salesdb?sslmode=disable";

export const leadgenPool = new Pool({
  connectionString: DATABASE_URL.replace(/^postgres:\/\//, "postgresql://"),
  max: 5,
  idleTimeoutMillis: 30000,
});
