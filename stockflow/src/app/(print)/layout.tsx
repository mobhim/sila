import { requireActor } from "@/server/auth/current";

/** Minimal authenticated layout for print/PDF views (no navigation chrome). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  return <div className="min-h-dvh bg-white print:bg-white">{children}</div>;
}
