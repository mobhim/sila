"use server";
import { act, type ActionResult } from "@/server/action";
import { markNotificationsRead } from "@/server/admin-queries";

export async function markReadAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("id") ?? "").slice(0, 64) || undefined;
  return act(async (actor) => {
    await markNotificationsRead(actor, id);
  }, { revalidate: ["/notifications"] });
}
