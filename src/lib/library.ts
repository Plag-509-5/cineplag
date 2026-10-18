import { desc, inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collections, reviews, watchProgress } from "@/db/schema";

export async function getLibrarySnapshot(userId: string) {
  const [userCollections, progress, userReviews] = await Promise.all([
    db.select().from(collections).where(eq(collections.userId, userId)).orderBy(desc(collections.createdAt)),
    db.select().from(watchProgress).where(eq(watchProgress.userId, userId)).orderBy(desc(watchProgress.updatedAt)),
    db.select().from(reviews).where(eq(reviews.userId, userId)).orderBy(desc(reviews.updatedAt)),
  ]);
  const items = userCollections.length
    ? await db.select().from(collectionItems).where(inArray(collectionItems.collectionId, userCollections.map((collection) => collection.id))).orderBy(desc(collectionItems.addedAt))
    : [];
  return {
    collections: userCollections.map((collection) => ({ ...collection, items: items.filter((item) => item.collectionId === collection.id) })),
    progress,
    reviews: userReviews,
  };
}
