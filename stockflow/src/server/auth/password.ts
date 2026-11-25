import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Minimum policy: 10+ chars, at least one letter and one digit. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 10) return "password_too_short";
  if (!/[A-Za-z؀-ۿ]/.test(plain) || !/\d/.test(plain)) return "password_too_weak";
  return null;
}

let dummy: string | null = null;
/** Compare against a throwaway hash so unknown emails take as long as wrong passwords. */
export async function burnPasswordCheck(plain: string) {
  dummy ??= await bcrypt.hash("stockflow-timing-equalizer", COST);
  await bcrypt.compare(plain, dummy);
}
