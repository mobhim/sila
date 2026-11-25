import { redirect } from "next/navigation";
import { getActor, homeFor } from "@/server/auth/current";

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homeFor(actor) : "/login");
}
