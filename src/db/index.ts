// Lazy database connection - only connects when needed
let db: ReturnType<typeof import("@kilocode/app-builder-db").createDatabase> | null = null;

export function getDb() {
  if (!db) {
    const { createDatabase } = require("@kilocode/app-builder-db");
    const schema = require("./schema");
    db = createDatabase(schema);
  }
  return db;
}
