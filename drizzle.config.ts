import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` only reads the schema, so the connection string below
 * is a placeholder: no database is contacted while generating migrations.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgres://drizzle:drizzle@127.0.0.1:5432/drizzle",
  },
  verbose: true,
  strict: false,
});
