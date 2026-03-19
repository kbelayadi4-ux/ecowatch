import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  telephone: text("telephone").notNull().unique(),
  nom: text("nom").notNull(),
  role: text("role", { enum: ["agent", "admin"] }).notNull().default("agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  agentNom: text("agent_nom").notNull(),
  agentTelephone: text("agent_telephone").notNull(),
  typeProbleme: text("type_probleme").notNull(),
  commentaire: text("commentaire"),
  zone: text("zone").notNull(),
  photo: text("photo"),
  dateCreation: integer("date_creation", { mode: "timestamp" }).notNull(),
  partage: integer("partage", { mode: "boolean" }).notNull().default(false),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  obsId: text("obs_id").notNull(),
  agentNom: text("agent_nom").notNull(),
  typeProbleme: text("type_probleme").notNull(),
  zone: text("zone").notNull(),
  dateCreation: integer("date_creation", { mode: "timestamp" }).notNull(),
  lu: integer("lu", { mode: "boolean" }).notNull().default(false),
});
