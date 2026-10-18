import { eq } from "drizzle-orm";
import { db } from "@/db";
import { collections, users } from "@/db/schema";
import { endSession, getCurrentUser, hashPassword, startSession, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
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

      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      let userToLog = existing;
      if (!existing) {
        userToLog = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(users)
            .values({
              name,
              email,
              googleId,
              avatar,
            })
            .returning();
          await tx.insert(collections).values({ userId: created.id, name: "Ma liste", description: "", color: "coral" });
          return created;
        });
      } else if (!existing.googleId || (avatar && !existing.avatar)) {
        const [updated] = await db
          .update(users)
          .set({
            googleId: existing.googleId || googleId,
            avatar: existing.avatar || avatar,
          })
          .where(eq(users.id, existing.id))
          .returning();
        userToLog = updated;
      }

      await startSession(userToLog.id);
      return Response.json({
        user: {
          id: userToLog.id,
          name: userToLog.name,
          email: userToLog.email,
          avatar: userToLog.avatar,
        },
      });
    }

    if (body.action === "register") {
      const name = String(body.name || "").trim().slice(0, 120);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
      const password = String(body.password || "");

      if (name.length < 2) return fail("Votre nom doit contenir au moins 2 caractères.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Saisissez une adresse e-mail valide.");
      if (password.length < 8 || password.length > 200) return fail("Le mot de passe doit contenir au moins 8 caractères.");

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing.length) return fail("Cette adresse e-mail est déjà utilisée.", 409);

      const passwordHash = await hashPassword(password);
      const user = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({ name, email, passwordHash })
          .returning({ id: users.id, name: users.name, email: users.email, avatar: users.avatar });
        await tx.insert(collections).values({ userId: created.id, name: "Ma liste", description: "", color: "coral" });
        return created;
      });

      await startSession(user.id);
      return Response.json({ user }, { status: 201 });
    }

    if (body.action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const [account] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!account || !(await verifyPassword(password, account.passwordHash))) {
        return fail("E-mail ou mot de passe incorrect.", 401);
      }

      await startSession(account.id);
      return Response.json({
        user: {
          id: account.id,
          name: account.name,
          email: account.email,
          avatar: account.avatar,
        },
      });
    }

    return fail("Action inconnue.");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return fail("Cette adresse e-mail est déjà utilisée.", 409);
    }
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
    const changes: { name: string; passwordHash?: string } = { name };

    if (body.newPassword) {
      if (String(body.newPassword).length < 8) return fail("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
      if (account?.passwordHash && !(await verifyPassword(String(body.currentPassword || ""), account.passwordHash))) {
        return fail("Mot de passe actuel incorrect.", 401);
      }
      changes.passwordHash = await hashPassword(String(body.newPassword));
    }

    const [updated] = await db
      .update(users)
      .set(changes)
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, avatar: users.avatar });
    return Response.json({ user: updated });
  } catch {
    return fail("Impossible de mettre à jour votre profil.", 500);
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Session requise.", 401);
    await endSession();
    await db.delete(users).where(eq(users.id, user.id));
    return Response.json({ user: null });
  } catch {
    return fail("Impossible de supprimer le compte.", 500);
  }
}
