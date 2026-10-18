import { MongoClient, type Db } from "mongodb";
import { mongoCollections } from "@/db/models";

type MongoState = {
  uri: string;
  clientPromise: Promise<MongoClient>;
  indexPromises: Map<string, Promise<void>>;
};

type MongoGlobal = typeof globalThis & {
  __cineplagMongoState?: MongoState;
};

const globalForMongo = globalThis as MongoGlobal;
let productionState: MongoState | undefined;

function createState(uri: string): MongoState {
  return {
    uri,
    clientPromise: new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 }).connect(),
    indexPromises: new Map(),
  };
}

function getMongoState(uri: string): MongoState {
  if (process.env.NODE_ENV === "production") {
    if (!productionState || productionState.uri !== uri) productionState = createState(uri);
    return productionState;
  }

  if (!globalForMongo.__cineplagMongoState || globalForMongo.__cineplagMongoState.uri !== uri) {
    globalForMongo.__cineplagMongoState = createState(uri);
  }
  return globalForMongo.__cineplagMongoState;
}

async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection(mongoCollections.users).createIndex({ email: 1 }, { unique: true, name: "users_email_unique" }),
    database.collection(mongoCollections.users).createIndex({ googleId: 1 }, { unique: true, sparse: true, name: "users_google_id_unique" }),
    database.collection(mongoCollections.sessions).createIndex({ userId: 1 }, { name: "sessions_user_id" }),
    database.collection(mongoCollections.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "sessions_expiry_ttl" }),
    database.collection(mongoCollections.collections).createIndex({ userId: 1, createdAt: -1 }, { name: "collections_user_created" }),
    database.collection(mongoCollections.collectionItems).createIndex({ collectionId: 1, slug: 1, type: 1 }, { unique: true, name: "collection_item_unique" }),
    database.collection(mongoCollections.collectionItems).createIndex({ collectionId: 1, addedAt: -1 }, { name: "collection_items_recent" }),
    database.collection(mongoCollections.watchProgress).createIndex({ userId: 1, slug: 1, type: 1 }, { unique: true, name: "watch_progress_unique" }),
    database.collection(mongoCollections.reviews).createIndex({ userId: 1, slug: 1, type: 1 }, { unique: true, name: "reviews_unique" }),
  ]);
}

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is required");

  const databaseName = process.env.MONGODB_DB?.trim() || "cineplag";
  const state = getMongoState(uri);
  let client: MongoClient;

  try {
    client = await state.clientPromise;
  } catch (error) {
    if (process.env.NODE_ENV === "production" && productionState === state) productionState = undefined;
    if (process.env.NODE_ENV !== "production" && globalForMongo.__cineplagMongoState === state) {
      globalForMongo.__cineplagMongoState = undefined;
    }
    throw error;
  }

  const database = client.db(databaseName);
  let indexPromise = state.indexPromises.get(databaseName);
  if (!indexPromise) {
    indexPromise = ensureIndexes(database);
    state.indexPromises.set(databaseName, indexPromise);
  }

  try {
    await indexPromise;
  } catch (error) {
    state.indexPromises.delete(databaseName);
    throw error;
  }

  return database;
}
