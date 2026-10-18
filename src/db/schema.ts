import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: varchar("google_id", { length: 255 }).unique(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_user_idx").on(table.userId)]);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  description: text("description").notNull().default(""),
  color: varchar("color", { length: 24 }).notNull().default("coral"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("collections_user_idx").on(table.userId)]);

export const collectionItems = pgTable("collection_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  image: text("image").notNull().default(""),
  year: varchar("year", { length: 12 }).notNull().default(""),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("collection_item_unique").on(table.collectionId, table.slug, table.type)]);

export const watchProgress = pgTable("watch_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  image: text("image").notNull().default(""),
  episodeId: text("episode_id").notNull().default(""),
  episodeTitle: text("episode_title").notNull().default(""),
  percent: integer("percent").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("progress_user_title_unique").on(table.userId, table.slug, table.type)]);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("review_user_title_unique").on(table.userId, table.slug, table.type)]);
