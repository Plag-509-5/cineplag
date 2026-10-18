import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import {
  mongoCollections,
  type CollectionDocument,
  type SessionDocument,
  type UserDocument,
  type CollectionItemDocument,
  type WatchProgressDocument,
  type ReviewDocument,
} from "@/db/models";
import { endSession, getCurrentUser, hashPassword, startSession, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function publicUser(user: UserDocument) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && Number(error.code) === 11000);
}

async function createDefaultCollection(userId: string) {
  const database = await getDb();
  const collection: CollectionDocument = {
    _id: randomUUID(),
    userId,
    name: "Ma liste",
    description: "",
    color: "coral",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await database.collection<CollectionDocument>(mongoCollections.collections).insertOne(collection);
}

export async function GET() {
  try {
    return Response.json({ user: await getCurrentUser() });
  } catch {
    return fail("Impossible de récupérer votre session.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "logout") {
      await endSession();
      return Response.json({ user: null });
    }

    if (body.action === "google") {
      const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
      const name = String(body.name || "").trim().slice(0, 120) || email.split("@")[0] || "Utilisateur";
      const googleId = String(body.googleId || body.sub || "").trim().slice(0, 255) || `google_${email}`;
      const avatar = typeof body.avatar === "string" && /^https?:\/\//.test(body.avatar) ? body.avatar : null;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail("Compte Google invalide.");
      }

      const database = await getDb();
      const users = database.collection<UserDocument>(mongoCollections.users);
      let userToLog = await users.findOne({ email });

      if (!userToLog) {
        const created: UserDocument = {
          _id: randomUUID(),
          name,
          email,
          googleId,
          avatar,
          createdAt: new Date(),
        };
        await users.insertOne(created);
        await createDefaultCollection(created._id);
        userToLog = created;
      } else {
        const updates: { googleId?: string; avatar?: string } = {};
        if (!userToLog.googleId) updates.googleId = googleId;
        if (avatar && !userToLog.avatar) updates.avatar = avatar;
        if (Object.keys(updates).length > 0) {
          await users.updateOne({ _id: userToLog._id }, { $set: updates });
          userToLog = { ...userToLog, ...updates };
        }
      }

      await startSession(userToLog._id);
      return Response.json({ user: publicUser(userToLog) });
    }

    if (body.action === "register") {
      const name = String(body.name || "").trim().slice(0, 120);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
      const password = String(body.password || "");

      if (name.length < 2) return fail("Votre nom doit contenir au moins 2 caractères.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Saisissez une adresse e-mail valide.");
      if (password.length < 8 || password.length > 200) return fail("Le mot de passe doit contenir au moins 8 caractères.");

      const database = await getDb();
      const users = database.collection<UserDocument>(mongoCollections.users);
      if (await users.findOne({ email }, { projection: { _id: 1 } })) {
        return fail("Cette adresse e-mail est déjà utilisée.", 409);
      }

      const user: UserDocument = {
        _id: randomUUID(),
        name,
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date(),
      };
      await users.insertOne(user);
      await createDefaultCollection(user._id);
      await startSession(user._id);
      return Response.json({ user: publicUser(user) }, { status: 201 });
    }

    if (body.action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const database = await getDb();
      const account = await database.collection<UserDocument>(mongoCollections.users).findOne({ email });

      if (!account || !(await verifyPassword(password, account.passwordHash))) {
        return fail("E-mail ou mot de passe incorrect.", 401);
      }

      await startSession(account._id);
      return Response.json({ user: publicUser(account) });
    }

    return fail("Action inconnue.");
  } catch (error) {
    if (isDuplicateKeyError(error)) return fail("Cette adresse e-mail est déjà utilisée.", 409);
    return fail("Une erreur est survenue. Réessayez dans un instant.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Connectez-vous pour modifier votre profil.", 401);
    const body = await request.json();
    const name = String(body.name || "").trim().slice(0, 120);
    if (name.length < 2) return fail("Votre nom doit contenir au moins 2 caractères.");

    const database = await getDb();
    const users = database.collection<UserDocument>(mongoCollections.users);
    const changes: { name: string; passwordHash?: string } = { name };

    if (body.newPassword) {
      const newPassword = String(body.newPassword);
      if (newPassword.length < 8 || newPassword.length > 200) {
        return fail("Le nouveau mot de passe doit contenir entre 8 et 200 caractères.");
      }
      const account = await users.findOne({ _id: user.id }, { projection: { passwordHash: 1 } });
      if (account?.passwordHash && !(await verifyPassword(String(body.currentPassword || ""), account.passwordHash))) {
        return fail("Mot de passe actuel incorrect.", 401);
      }
      changes.passwordHash = await hashPassword(newPassword);
    }

    await users.updateOne({ _id: user.id }, { $set: changes });
    const updated = await users.findOne({ _id: user.id });
    if (!updated) return fail("Compte introuvable.", 404);
    return Response.json({ user: publicUser(updated) });
  } catch {
    return fail("Impossible de mettre à jour votre profil.", 500);
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Session requise.", 401);

    await endSession();
    const database = await getDb();
    const ownedCollections = await database.collection<CollectionDocument>(mongoCollections.collections)
      .find({ userId: user.id }, { projection: { _id: 1 } })
      .toArray();
    const collectionIds = ownedCollections.map((collection) => collection._id);

    await Promise.all([
      database.collection<SessionDocument>(mongoCollections.sessions).deleteMany({ userId: user.id }),
      database.collection<CollectionItemDocument>(mongoCollections.collectionItems).deleteMany({ collectionId: { $in: collectionIds } }),
      database.collection<CollectionDocument>(mongoCollections.collections).deleteMany({ userId: user.id }),
      database.collection<WatchProgressDocument>(mongoCollections.watchProgress).deleteMany({ userId: user.id }),
      database.collection<ReviewDocument>(mongoCollections.reviews).deleteMany({ userId: user.id }),
      database.collection<UserDocument>(mongoCollections.users).deleteOne({ _id: user.id }),
    ]);

    return Response.json({ user: null });
  } catch {
    return fail("Impossible de supprimer le compte.", 500);
  }
}
