import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { getDb } from "@/db";
import {
  mongoCollections,
  type CollectionDocument,
  type CollectionItemDocument,
  type ReviewDocument,
  type WatchProgressDocument,
} from "@/db/models";
import { getCurrentUser } from "@/lib/auth";
import { validType } from "@/lib/catalog";
import { getLibrarySnapshot } from "@/lib/library";

export const dynamic = "force-dynamic";

type Input = Record<string, unknown>;
const text = (value: unknown, max = 255) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message: string, status = 400) => Response.json({ error: message }, { status });
const score = (value: unknown) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
const rating = (value: unknown) => Math.round(Number(value) || 0);

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && Number(error.code) === 11000);
}

function readItem(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Input;
  const slug = text(item.slug), title = text(item.title), type = text(item.type), image = text(item.image, 2000);
  if (!slug || !title || !validType(type)) return null;
  return { slug, title, type, image: /^https?:\/\//i.test(image) ? image : "", year: text(item.year, 12) };
}

async function ownCollection(database: Db, id: string, userId: string) {
  const found = await database.collection<CollectionDocument>(mongoCollections.collections)
    .findOne({ _id: id, userId }, { projection: { _id: 1 } });
  return !!found;
}

async function ownItem(database: Db, id: string, userId: string) {
  const item = await database.collection<CollectionItemDocument>(mongoCollections.collectionItems)
    .findOne({ _id: id }, { projection: { collectionId: 1 } });
  if (!item) return false;
  return ownCollection(database, item.collectionId, userId);
}

async function success(userId: string) {
  return Response.json({ library: await getLibrarySnapshot(userId) });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Connectez-vous pour accéder à votre bibliothèque.", 401);
    return success(user.id);
  } catch {
    return fail("Impossible de charger votre bibliothèque.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Connectez-vous pour enregistrer vos titres.", 401);
    const body: Input = await request.json();
    const database = await getDb();

    if (body.kind === "collection") {
      const name = text(body.name, 80), description = text(body.description, 300);
      if (name.length < 2) return fail("Donnez un nom d'au moins 2 caractères à votre collection.");
      const requestedColor = text(body.color);
      const color = ["coral", "violet", "blue", "gold"].includes(requestedColor) ? requestedColor : "coral";
      const now = new Date();
      const collection: CollectionDocument = {
        _id: randomUUID(), userId: user.id, name, description, color, createdAt: now, updatedAt: now,
      };
      await database.collection<CollectionDocument>(mongoCollections.collections).insertOne(collection);
    } else if (body.kind === "item") {
      const collectionId = text(body.collectionId);
      const item = readItem(body.item);
      if (!validId(collectionId) || !(await ownCollection(database, collectionId, user.id))) return fail("Collection introuvable.", 404);
      if (!item) return fail("Titre invalide.");
      await database.collection<CollectionItemDocument>(mongoCollections.collectionItems).updateOne(
        { collectionId, slug: item.slug, type: item.type },
        { $setOnInsert: { _id: randomUUID(), collectionId, ...item, addedAt: new Date() } },
        { upsert: true }
      );
    } else if (body.kind === "progress") {
      const item = readItem(body.item);
      if (!item) return fail("Titre invalide.");
      const values = {
        title: item.title,
        image: item.image,
        episodeId: text(body.episodeId, 255),
        episodeTitle: text(body.episodeTitle, 255),
        percent: score(body.percent),
        updatedAt: new Date(),
      };
      await database.collection<WatchProgressDocument>(mongoCollections.watchProgress).updateOne(
        { userId: user.id, slug: item.slug, type: item.type },
        { $set: values, $setOnInsert: { _id: randomUUID(), userId: user.id, slug: item.slug, type: item.type } },
        { upsert: true }
      );
    } else if (body.kind === "review") {
      const slug = text(body.slug), type = text(body.type), value = rating(body.rating);
      if (!slug || !validType(type) || value < 1 || value > 5) return fail("Choisissez une note entre 1 et 5.");
      const content = text(body.body, 1200);
      await database.collection<ReviewDocument>(mongoCollections.reviews).updateOne(
        { userId: user.id, slug, type },
        { $set: { rating: value, body: content, updatedAt: new Date() }, $setOnInsert: { _id: randomUUID(), userId: user.id, slug, type } },
        { upsert: true }
      );
    } else {
      return fail("Type de ressource inconnu.");
    }

    return success(user.id);
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("Ce titre est déjà dans cette collection.", 409);
    return fail("Impossible d'enregistrer les modifications.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Session requise.", 401);
    const body: Input = await request.json();
    const id = text(body.id);
    if (!validId(id)) return fail("Identifiant invalide.");
    const database = await getDb();

    if (body.kind === "collection") {
      if (!(await ownCollection(database, id, user.id))) return fail("Collection introuvable.", 404);
      const name = text(body.name, 80);
      if (name.length < 2) return fail("Le nom doit contenir au moins 2 caractères.");
      const requestedColor = text(body.color);
      const color = ["coral", "violet", "blue", "gold"].includes(requestedColor) ? requestedColor : "coral";
      await database.collection<CollectionDocument>(mongoCollections.collections).updateOne(
        { _id: id, userId: user.id },
        { $set: { name, description: text(body.description, 300), color, updatedAt: new Date() } }
      );
    } else if (body.kind === "item") {
      if (!(await ownItem(database, id, user.id))) return fail("Élément introuvable.", 404);
      const collectionId = text(body.collectionId);
      if (!validId(collectionId) || !(await ownCollection(database, collectionId, user.id))) return fail("Collection cible introuvable.", 404);
      await database.collection<CollectionItemDocument>(mongoCollections.collectionItems).updateOne(
        { _id: id },
        { $set: { collectionId } }
      );
    } else if (body.kind === "progress") {
      const progress = database.collection<WatchProgressDocument>(mongoCollections.watchProgress);
      const existing = await progress.findOne({ _id: id, userId: user.id }, { projection: { _id: 1 } });
      if (!existing) return fail("Lecture introuvable.", 404);
      await progress.updateOne({ _id: id, userId: user.id }, { $set: { percent: score(body.percent), updatedAt: new Date() } });
    } else if (body.kind === "review") {
      const reviews = database.collection<ReviewDocument>(mongoCollections.reviews);
      const existing = await reviews.findOne({ _id: id, userId: user.id }, { projection: { _id: 1 } });
      if (!existing) return fail("Avis introuvable.", 404);
      const value = rating(body.rating);
      if (value < 1 || value > 5) return fail("Choisissez une note entre 1 et 5.");
      await reviews.updateOne({ _id: id, userId: user.id }, { $set: { rating: value, body: text(body.body, 1200), updatedAt: new Date() } });
    } else {
      return fail("Type de ressource inconnu.");
    }

    return success(user.id);
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("Ce titre est déjà dans cette collection.", 409);
    return fail("Impossible de modifier cette ressource.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Session requise.", 401);
    const body: Input = await request.json();
    const id = text(body.id);
    if (!validId(id)) return fail("Identifiant invalide.");
    const database = await getDb();

    if (body.kind === "collection") {
      if (!(await ownCollection(database, id, user.id))) return fail("Collection introuvable.", 404);
      await database.collection<CollectionItemDocument>(mongoCollections.collectionItems).deleteMany({ collectionId: id });
      await database.collection<CollectionDocument>(mongoCollections.collections).deleteOne({ _id: id, userId: user.id });
    } else if (body.kind === "item") {
      if (!(await ownItem(database, id, user.id))) return fail("Élément introuvable.", 404);
      await database.collection<CollectionItemDocument>(mongoCollections.collectionItems).deleteOne({ _id: id });
    } else if (body.kind === "progress") {
      const removed = await database.collection<WatchProgressDocument>(mongoCollections.watchProgress).deleteOne({ _id: id, userId: user.id });
      if (!removed.deletedCount) return fail("Lecture introuvable.", 404);
    } else if (body.kind === "review") {
      const removed = await database.collection<ReviewDocument>(mongoCollections.reviews).deleteOne({ _id: id, userId: user.id });
      if (!removed.deletedCount) return fail("Avis introuvable.", 404);
    } else {
      return fail("Type de ressource inconnu.");
    }

    return success(user.id);
  } catch {
    return fail("Impossible de supprimer cette ressource.", 500);
  }
}
