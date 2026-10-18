import { getDb } from "@/db";
import {
  mongoCollections,
  withPublicId,
  type CollectionDocument,
  type CollectionItemDocument,
  type ReviewDocument,
  type WatchProgressDocument,
} from "@/db/models";

export async function getLibrarySnapshot(userId: string) {
  const database = await getDb();
  const [collectionDocuments, progressDocuments, reviewDocuments] = await Promise.all([
    database.collection<CollectionDocument>(mongoCollections.collections)
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray(),
    database.collection<WatchProgressDocument>(mongoCollections.watchProgress)
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray(),
    database.collection<ReviewDocument>(mongoCollections.reviews)
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray(),
  ]);

  const collectionIds = collectionDocuments.map((collection) => collection._id);
  const itemDocuments = collectionIds.length
    ? await database.collection<CollectionItemDocument>(mongoCollections.collectionItems)
        .find({ collectionId: { $in: collectionIds } })
        .sort({ addedAt: -1 })
        .toArray()
    : [];

  return {
    collections: collectionDocuments.map((collection) => ({
      ...withPublicId(collection),
      items: itemDocuments
        .filter((item) => item.collectionId === collection._id)
        .map(withPublicId),
    })),
    progress: progressDocuments.map(withPublicId),
    reviews: reviewDocuments.map(withPublicId),
  };
}
