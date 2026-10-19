import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Pooled connection: the app runs in serverless functions.
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export * from "./schema";
