import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { actorFromToken, createSession, revokeUserSessions } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { createUser, resetPassword, updateUser } from "@/server/users";
import { makeBranch, makeUser, resetDb } from "./helpers";

describe("authentication", () => {
  beforeEach(resetDb);

  it("hashes passwords and enforces the policy", async () => {
    const h = await hashPassword("Correct horse 42");
    expect(await verifyPassword("Correct horse 42", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(passwordProblem("short1")).toBe("password_too_short");
    expect(passwordProblem("onlyletterslong")).toBe("password_too_weak");
    expect(passwordProblem("letters and 123")).toBeNull();
  });

  it("stores only token hashes and invalidates sessions of deactivated users", async () => {
    const b = await makeBranch();
    const owner = await makeUser("OWNER");
    const emp = await makeUser("EMPLOYEE", [b.id]);
    const { token } = await createSession(emp.id);
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
    expect((await actorFromToken(token))?.id).toBe(emp.id);
    await updateUser(owner, emp.id, { name: emp.name, email: emp.email, role: "EMPLOYEE", status: "INACTIVE", locale: "ar", branchIds: [b.id] });
    expect(await actorFromToken(token)).toBeNull();
    expect(await actorFromToken("garbage")).toBeNull();
  });

  it("rate-limits per key", async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await rateLimit("login:x@y.z", 5, 60));
    expect(results.filter(Boolean).length).toBe(5);
  });

  it("managers can only create employees for their branches; temp passwords force a change", async () => {
    const a = await makeBranch();
    const c = await makeBranch();
    const mgr = await makeUser("MANAGER", [a.id]);
    const { user, temporaryPassword } = await createUser(mgr, { name: "New", email: "new@x.sa", role: "EMPLOYEE", status: "ACTIVE", locale: "ar", branchIds: [a.id] });
    expect(user.mustChangePassword).toBe(true);
    expect(await verifyPassword(temporaryPassword, user.passwordHash)).toBe(true);
    await expect(createUser(mgr, { name: "X", email: "x@x.sa", role: "EMPLOYEE", status: "ACTIVE", locale: "ar", branchIds: [c.id] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createUser(mgr, { name: "Y", email: "y@x.sa", role: "MANAGER", status: "ACTIVE", locale: "ar", branchIds: [a.id] })).rejects.toMatchObject({ code: "forbidden" });
    const { token } = await createSession(user.id);
    await resetPassword(mgr, user.id);
    expect(await actorFromToken(token)).toBeNull();
    await revokeUserSessions(user.id);
  });
});
