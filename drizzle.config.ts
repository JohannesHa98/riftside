import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Migrations run outside Next.js, so .env.local has to be loaded by hand.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Direct (unpooled) connection: migrations need a real session.
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
  strict: true,
  verbose: true,
});
