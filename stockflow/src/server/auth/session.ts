import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import type { Actor } from "../rbac";

export const SESSION_COOKIE = "sf_session";
const IDLE_MS = 12 * 60 * 60 * 1000; // 12 h without activity
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max
const TOUCH_MS = 5 * 60 * 1000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, ip?: string | null, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(Date.now() + ABSOLUTE_MS),
      ip: ip ?? null,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, maxAge: ABSOLUTE_MS / 1000 };
}

export async function loadActor(userId: string): Promise<Actor | null> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { branches: true } });
  if (!user || user.status !== "ACTIVE") return null;
  const primary = user.branches.find((b) => b.isPrimary) ?? user.branches[0];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    locale: user.locale,
    supplierId: user.supplierId,
    branchIds: user.branches.map((b) => b.branchId),
    primaryBranchId: primary?.branchId ?? null,
  };
}

export async function actorFromToken(token: string | undefined | null): Promise<(Actor & { mustChangePassword: boolean }) | null> {
  if (!token || token.length > 100) return null;
  const s = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > IDLE_MS || s.user.status !== "ACTIVE") {
    await db.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  if (now - s.lastSeenAt.getTime() > TOUCH_MS) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const actor = await loadActor(s.userId);
  return actor ? { ...actor, mustChangePassword: s.user.mustChangePassword } : null;
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hash(token) } });
}

export async function revokeUserSessions(userId: string, exceptToken?: string | null) {
  await db.session.deleteMany({
    where: { userId, ...(exceptToken ? { NOT: { tokenHash: hash(exceptToken) } } : {}) },
  });
}
