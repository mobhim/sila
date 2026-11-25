/**
 * Production bootstrap: creates the first owner account if no owner exists.
 *   OWNER_EMAIL=you@company.sa OWNER_NAME="Your Name" npm run db:bootstrap
 * A temporary password is printed once; the owner must change it at first sign-in.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { temporaryPassword } from "../src/server/users";

const db = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.OWNER_NAME?.trim() || "Owner";
  if (!email) throw new Error("Set OWNER_EMAIL");
  if (await db.user.count({ where: { role: "OWNER" } })) {
    console.log("An owner already exists — nothing to do.");
    return;
  }
  const temp = temporaryPassword();
  await db.settings.upsert({ where: { id: 1 }, create: { id: 1, businessName: process.env.BUSINESS_NAME || "StockFlow" }, update: process.env.BUSINESS_NAME ? { businessName: process.env.BUSINESS_NAME } : {} });
  await db.user.create({ data: { email, name, role: "OWNER", passwordHash: await hashPassword(temp), mustChangePassword: true } });
  console.log(`Owner created: ${email}\nTemporary password (shown once): ${temp}`);
}

main().finally(() => db.$disconnect());
