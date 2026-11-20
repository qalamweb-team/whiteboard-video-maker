import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

// One row per person the Gateway has signed in, keyed by the Gateway's user id.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    // The owner (`user.id`); every query filters by it.
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // RenderSettings as JSON (src/lib/video.ts).
    settings: text("settings").notNull().default("{}"),
    audioKey: text("audio_key"),
    audioName: text("audio_name"),
    audioMime: text("audio_mime"),
    audioDurationMs: integer("audio_duration_ms"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.updatedAt)],
);

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    position: integer("position").notNull(),
    durationMs: integer("duration_ms").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    imageKey: text("image_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scenes_project_idx").on(t.projectId, t.position)],
);
