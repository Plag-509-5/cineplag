import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { mongoCollections, type SessionDocument, type UserDocument } from "@/db/models";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "cineplag_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  googleId?: string | null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toSessionUser(user: UserDocument): SessionUser {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    googleId: user.googleId ?? null,
  };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored?: string | null) {
  if (!stored) return false;
  try {
    const [algorithm, salt, hash] = stored.split(":");
    if (algorithm !== "scrypt" || !salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || token.length !== 64) return null;

  const database = await getDb();
  const session = await database.collection<SessionDocument>(mongoCollections.sessions).findOne({
    _id: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  const user = await database.collection<UserDocument>(mongoCollections.users).findOne({ _id: session.userId });
  return user ? toSessionUser(user) : null;
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const database = await getDb();

  await database.collection<SessionDocument>(mongoCollections.sessions).insertOne({
    _id: hashToken(token),
    userId,
    expiresAt,
    createdAt: new Date(),
  });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  try {
    if (token) {
      const database = await getDb();
      await database.collection<SessionDocument>(mongoCollections.sessions).deleteOne({ _id: hashToken(token) });
    }
  } finally {
    store.delete(COOKIE_NAME);
  }
}
