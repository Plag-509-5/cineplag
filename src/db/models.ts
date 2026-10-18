import type { Document } from "mongodb";

export const mongoCollections = {
  users: "users",
  sessions: "sessions",
  collections: "collections",
  collectionItems: "collection_items",
  watchProgress: "watch_progress",
  reviews: "reviews",
} as const;

export interface UserDocument extends Document {
  _id: string;
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  avatar?: string | null;
  createdAt: Date;
}

export interface SessionDocument extends Document {
  _id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CollectionDocument extends Document {
  _id: string;
  userId: string;
  name: string;
  description: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionItemDocument extends Document {
  _id: string;
  collectionId: string;
  slug: string;
  type: string;
  title: string;
  image: string;
  year: string;
  addedAt: Date;
}

export interface WatchProgressDocument extends Document {
  _id: string;
  userId: string;
  slug: string;
  type: string;
  title: string;
  image: string;
  episodeId: string;
  episodeTitle: string;
  percent: number;
  updatedAt: Date;
}

export interface ReviewDocument extends Document {
  _id: string;
  userId: string;
  slug: string;
  type: string;
  rating: number;
  body: string;
  updatedAt: Date;
}

export function withPublicId<T extends { _id: string }>(document: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...fields } = document;
  return { ...fields, id: _id } as Omit<T, "_id"> & { id: string };
}
