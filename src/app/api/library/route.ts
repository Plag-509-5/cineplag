import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collections, reviews, watchProgress } from "@/db/schema";
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

function readItem(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Input;
  const slug = text(item.slug), title = text(item.title), type = text(item.type), image = text(item.image, 2000);
  if (!slug || !title || !validType(type)) return null;
  return { slug, title, type, image: /^https?:\/\//i.test(image) ? image : "", year: text(item.year, 12) };
}

async function ownCollection(id: string, userId: string) {
  const [found] = await db.select({ id: collections.id }).from(collections).where(and(eq(collections.id, id), eq(collections.userId, userId))).limit(1);
  return !!found;
}

async function ownItem(id: string, userId: string) {
  const [found] = await db.select({ id: collectionItems.id }).from(collectionItems)
    .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
    .where(and(eq(collectionItems.id, id), eq(collections.userId, userId))).limit(1);
  return !!found;
}

async function success(userId: string) {
  return Response.json({ library: await getLibrarySnapshot(userId) });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Connectez-vous pour accéder à votre bibliothèque.", 401);
    return success(user.id);
  } catch { return fail("Impossible de charger votre bibliothèque.", 500); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Connectez-vous pour enregistrer vos titres.", 401);
    const body: Input = await request.json();
    if (body.kind === "collection") {
      const name = text(body.name, 80), description = text(body.description, 300);
      if (name.length < 2) return fail("Donnez un nom d'au moins 2 caractères à votre collection.");
      const color = ["coral", "violet", "blue", "gold"].includes(text(body.color)) ? text(body.color) : "coral";
      await db.insert(collections).values({ userId: user.id, name, description, color });
    } else if (body.kind === "item") {
      const collectionId = text(body.collectionId);
      const item = readItem(body.item);
      if (!validId(collectionId) || !(await ownCollection(collectionId, user.id))) return fail("Collection introuvable.", 404);
      if (!item) return fail("Titre invalide.");
      await db.insert(collectionItems).values({ collectionId, ...item }).onConflictDoNothing();
    } else if (body.kind === "progress") {
      const item = readItem(body.item);
      if (!item) return fail("Titre invalide.");
      const values = { userId: user.id, ...item, episodeId: text(body.episodeId, 255), episodeTitle: text(body.episodeTitle, 255), percent: score(body.percent), updatedAt: new Date() };
      await db.insert(watchProgress).values(values).onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.slug, watchProgress.type],
        set: { title: values.title, image: values.image, episodeId: values.episodeId, episodeTitle: values.episodeTitle, percent: values.percent, updatedAt: new Date() },
      });
    } else if (body.kind === "review") {
      const slug = text(body.slug), type = text(body.type), value = rating(body.rating);
      if (!slug || !validType(type) || value < 1 || value > 5) return fail("Choisissez une note entre 1 et 5.");
      const content = text(body.body, 1200);
      await db.insert(reviews).values({ userId: user.id, slug, type, rating: value, body: content }).onConflictDoUpdate({
        target: [reviews.userId, reviews.slug, reviews.type], set: { rating: value, body: content, updatedAt: new Date() },
      });
    } else return fail("Type de ressource inconnu.");
    return success(user.id);
  } catch { return fail("Impossible d'enregistrer les modifications.", 500); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Session requise.", 401);
    const body: Input = await request.json();
    const id = text(body.id);
    if (!validId(id)) return fail("Identifiant invalide.");
    if (body.kind === "collection") {
      if (!(await ownCollection(id, user.id))) return fail("Collection introuvable.", 404);
      const name = text(body.name, 80);
      if (name.length < 2) return fail("Le nom doit contenir au moins 2 caractères.");
      const color = ["coral", "violet", "blue", "gold"].includes(text(body.color)) ? text(body.color) : "coral";
      await db.update(collections).set({ name, description: text(body.description, 300), color, updatedAt: new Date() }).where(eq(collections.id, id));
    } else if (body.kind === "item") {
      if (!(await ownItem(id, user.id))) return fail("Élément introuvable.", 404);
      const collectionId = text(body.collectionId);
      if (!validId(collectionId) || !(await ownCollection(collectionId, user.id))) return fail("Collection cible introuvable.", 404);
      await db.update(collectionItems).set({ collectionId }).where(eq(collectionItems.id, id));
    } else if (body.kind === "progress") {
      const [found] = await db.select({ id: watchProgress.id }).from(watchProgress).where(and(eq(watchProgress.id, id), eq(watchProgress.userId, user.id))).limit(1);
      if (!found) return fail("Lecture introuvable.", 404);
      await db.update(watchProgress).set({ percent: score(body.percent), updatedAt: new Date() }).where(eq(watchProgress.id, id));
    } else if (body.kind === "review") {
      const [found] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.id, id), eq(reviews.userId, user.id))).limit(1);
      if (!found) return fail("Avis introuvable.", 404);
      const value = rating(body.rating);
      if (value < 1 || value > 5) return fail("Choisissez une note entre 1 et 5.");
      await db.update(reviews).set({ rating: value, body: text(body.body, 1200), updatedAt: new Date() }).where(eq(reviews.id, id));
    } else return fail("Type de ressource inconnu.");
    return success(user.id);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return fail("Ce titre est déjà dans cette collection.", 409);
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
    if (body.kind === "collection") {
      if (!(await ownCollection(id, user.id))) return fail("Collection introuvable.", 404);
      await db.delete(collections).where(eq(collections.id, id));
    } else if (body.kind === "item") {
      if (!(await ownItem(id, user.id))) return fail("Élément introuvable.", 404);
      await db.delete(collectionItems).where(eq(collectionItems.id, id));
    } else if (body.kind === "progress") {
      const removed = await db.delete(watchProgress).where(and(eq(watchProgress.id, id), eq(watchProgress.userId, user.id))).returning({ id: watchProgress.id });
      if (!removed.length) return fail("Lecture introuvable.", 404);
    } else if (body.kind === "review") {
      const removed = await db.delete(reviews).where(and(eq(reviews.id, id), eq(reviews.userId, user.id))).returning({ id: reviews.id });
      if (!removed.length) return fail("Avis introuvable.", 404);
    } else return fail("Type de ressource inconnu.");
    return success(user.id);
  } catch { return fail("Impossible de supprimer cette ressource.", 500); }
}
