import { db } from "@/server/db";
import { api } from "@/server/api";
import { notFound } from "@/server/errors";
import { hasBranchAccess } from "@/server/rbac";
import { readUpload } from "@/server/storage";

/**
 * GET /api/files/:id — serve an attachment to users allowed to see it:
 * the uploader; staff with access to its branch (or any staff for org-wide files);
 * the supplier it was shared with.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async (actor) => {
    const { id } = await params;
    const att = await db.attachment.findUnique({ where: { id } });
    if (!att) throw notFound();
    const isProductImage = (await db.product.count({ where: { imageId: id } })) > 0;
    const allowed =
      att.uploadedById === actor.id ||
      (actor.role === "SUPPLIER" ? att.supplierId !== null && att.supplierId === actor.supplierId : isProductImage || !att.branchId || hasBranchAccess(actor, att.branchId));
    if (!allowed) throw notFound();
    const data = await readUpload(att.storageKey);
    const inline = new URL(req.url).searchParams.get("download") !== "1" && att.mimeType.startsWith("image/");
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  });
}
